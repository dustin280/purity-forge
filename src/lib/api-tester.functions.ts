import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Syn API Tester — admin-only server fns that exercise the partner-facing
 * public API from the server side (avoids CORS, and keeps the webhook signing
 * secret / export API key server-only; neither value is ever returned).
 */

const BASES = {
  production: "https://syxlab.org",
  staging: "https://project--d45e2e9d-d5e3-4ac1-b61d-8c2b2a16f546-dev.lovable.app",
} as const;

type Env = keyof typeof BASES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

async function hmacHex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function activeWebhookSecret(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .select("secret, status")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (data?.secret) return data.secret as string;
  } catch {
    /* fall through to env */
  }
  return process.env["PARTNER_WEBHOOK_SECRET"] ?? null;
}

async function exportApiKey(): Promise<{ key: string | null; active: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("export_config").select("api_key, is_active").limit(1).maybeSingle();
  return { key: (data?.api_key as string | undefined) ?? null, active: !!data?.is_active };
}

type CallResult = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  body: string;
  signaturePreview?: string;
};

async function doCall(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<CallResult> {
  const started = Date.now();
  const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  const text = await res.text();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    durationMs: Date.now() - started,
    url,
    method: init.method,
    requestHeaders: init.headers,
    requestBody: init.body ?? null,
    responseHeaders,
    body: text,
  };
}

function redact(headers: Record<string, string>) {
  const out = { ...headers };
  if (out["x-api-key"]) out["x-api-key"] = `${out["x-api-key"].slice(0, 4)}…${out["x-api-key"].slice(-4)}`;
  return out;
}

const envSchema = z.enum(["production", "staging"]);

/** POST /api/public/orders/intake — signs the exact bytes sent. */
export const testOrderIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        env: envSchema,
        body: z.string().min(1).max(200_000),
        tamperSignature: z.boolean().optional().default(false),
        omitSignature: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<CallResult> => {
    await assertAdmin(context);
    const secret = await activeWebhookSecret();
    if (!secret && !data.omitSignature) throw new Error("No active partner webhook secret configured");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let sigPreview: string | undefined;
    if (!data.omitSignature && secret) {
      let sig = await hmacHex(secret, data.body);
      if (data.tamperSignature) sig = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
      headers["x-signature"] = sig;
      sigPreview = `${sig.slice(0, 12)}…${sig.slice(-6)}`;
    }

    const result = await doCall(`${BASES[data.env]}/api/public/orders/intake`, {
      method: "POST",
      headers,
      body: data.body,
    });
    return { ...result, signaturePreview: sigPreview };
  });

/** GET status / exports endpoints using the shared x-api-key. */
export const testKeyedEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        env: envSchema,
        kind: z.enum(["status_list", "status_one", "export"]),
        batchId: z.string().max(128).optional().default(""),
        client: z.string().max(255).optional().default(""),
        since: z.string().max(64).optional().default(""),
        limit: z.number().int().min(1).max(200).optional().default(50),
        omitKey: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<CallResult & { exportsActive: boolean }> => {
    await assertAdmin(context);
    const { key, active } = await exportApiKey();
    if (!key && !data.omitKey) throw new Error("No API key configured under Integrations");

    let path: string;
    if (data.kind === "status_one") {
      if (!data.batchId) throw new Error("Batch ID is required");
      path = `/api/public/status/${encodeURIComponent(data.batchId)}`;
    } else if (data.kind === "export") {
      if (!data.batchId) throw new Error("Batch ID (or lot) is required");
      path = `/api/public/exports/${encodeURIComponent(data.batchId)}`;
    } else {
      const qs = new URLSearchParams();
      if (data.client) qs.set("client", data.client);
      if (data.since) qs.set("since", data.since);
      qs.set("limit", String(data.limit));
      path = `/api/public/status?${qs.toString()}`;
    }

    const headers: Record<string, string> = {};
    if (!data.omitKey && key) headers["x-api-key"] = key;

    const result = await doCall(`${BASES[data.env]}${path}`, { method: "GET", headers });
    return { ...result, requestHeaders: redact(result.requestHeaders), exportsActive: active };
  });

/** Config readiness banner: is a webhook secret / API key present? */
export const getApiTesterConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const secret = await activeWebhookSecret();
    const { key, active } = await exportApiKey();
    return {
      hasWebhookSecret: !!secret,
      hasApiKey: !!key,
      exportsActive: active,
      bases: BASES as Record<Env, string>,
    };
  });
