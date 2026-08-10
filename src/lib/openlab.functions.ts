/**
 * Server functions for the Instrument Communication / OpenLab CDS module.
 *
 * Phase 1 is read-only: an admin syncs a snapshot of the OpenLab project
 * folder into the `openlab-cds` Storage bucket, then everyone can browse
 * the cached Methods and Sequences tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OpenLabSettings {
  id: string;
  project_folder_path: string;
  storage_prefix: string;
  last_synced_at: string | null;
  notes: string | null;
  updated_at: string;
  drive_methods_folder_id: string | null;
  drive_sequences_folder_id: string | null;
  drive_reports_folder_id: string | null;
  drive_last_pulled_at: string | null;
  drive_last_pushed_at: string | null;
}

export interface OpenLabMethod {
  id: string;
  name: string;
  description: string | null;
  relative_path: string;
  last_modified: string | null;
  size_bytes: number | null;
  synced_at: string;
  instrument_id: string | null;
}

export interface OpenLabSequence {
  id: string;
  name: string;
  status: string;
  relative_path: string;
  last_modified: string | null;
  line_count: number;
  synced_at: string;
  instrument_id: string | null;
}

export interface OpenLabReport {
  id: string;
  name: string;
  relative_path: string;
  last_modified: string | null;
  size_bytes: number | null;
  synced_at: string;
  instrument_id: string | null;
}

export type ConnectionStatus = "connected" | "disconnected" | "not_configured";

const BUCKET = "openlab-cds";

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin role required");
}

function normalizePrefix(p: string): string {
  let s = (p ?? "").trim();
  if (!s) s = "default/";
  if (!s.endsWith("/")) s += "/";
  return s.replace(/^\/+/, "");
}

export const getOpenLabSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("openlab_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const [{ count: mCount }, { count: sCount }] = await Promise.all([
      context.supabase
        .from("openlab_methods")
        .select("*", { count: "exact", head: true }),
      context.supabase
        .from("openlab_sequences")
        .select("*", { count: "exact", head: true }),
    ]);

    let status: ConnectionStatus = "not_configured";
    if (data?.project_folder_path) {
      status = (mCount ?? 0) + (sCount ?? 0) > 0 ? "connected" : "disconnected";
    }

    return {
      settings: (data ?? null) as OpenLabSettings | null,
      status,
      counts: { methods: mCount ?? 0, sequences: sCount ?? 0 },
    };
  });

const updateSchema = z.object({
  project_folder_path: z.string().max(500),
  storage_prefix: z.string().max(200),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateOpenLabSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("openlab_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload = {
      project_folder_path: data.project_folder_path.trim(),
      storage_prefix: normalizePrefix(data.storage_prefix),
      notes: data.notes ?? null,
    };
    if (existing?.id) {
      const { data: row, error } = await context.supabase
        .from("openlab_settings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return row as unknown as OpenLabSettings;
    }
    const { data: row, error } = await context.supabase
      .from("openlab_settings")
      .insert({ singleton: true, ...payload })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as OpenLabSettings;
  });

const instrumentFilterInput = z.object({ instrument_id: z.string().uuid().optional() });

export const listOpenLabMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => instrumentFilterInput.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("openlab_methods").select("*");
    if (data.instrument_id) q = q.eq("instrument_id", data.instrument_id);
    const { data: rows, error } = await q.order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as OpenLabMethod[];
  });

export const listOpenLabSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => instrumentFilterInput.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("openlab_sequences").select("*");
    if (data.instrument_id) q = q.eq("instrument_id", data.instrument_id);
    const { data: rows, error } = await q.order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as OpenLabSequence[];
  });

export const listOpenLabReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => instrumentFilterInput.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("openlab_reports").select("*");
    if (data.instrument_id) q = q.eq("instrument_id", data.instrument_id);
    const { data: rows, error } = await q.order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as OpenLabReport[];
  });

export const getOpenLabMethod = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(255) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("openlab_methods")
      .select("*")
      .eq("name", data.name)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { method: null, preview: null as string | null };

    // Try to download a descriptor file if one exists at the cached path
    let preview: string | null = null;
    try {
      const { data: file } = await context.supabase.storage
        .from(BUCKET)
        .download(row.relative_path);
      if (file) {
        const text = await file.text();
        preview = text.split("\n").slice(0, 200).join("\n");
      }
    } catch {
      preview = null;
    }
    return { method: row as unknown as OpenLabMethod, preview };
  });

function parseCsv(text: string): string[][] {
  // Minimal CSV parser supporting quoted fields and commas.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

export const getOpenLabSequence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(255) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("openlab_sequences")
      .select("*")
      .eq("name", data.name)
      .maybeSingle();
    if (error) throw error;
    if (!row)
      return {
        sequence: null,
        headers: [] as string[],
        rows: [] as string[][],
      };

    let headers: string[] = [];
    let bodyRows: string[][] = [];
    try {
      const { data: file } = await context.supabase.storage
        .from(BUCKET)
        .download(row.relative_path);
      if (file) {
        const text = await file.text();
        const parsed = parseCsv(text);
        if (parsed.length) {
          headers = parsed[0];
          bodyRows = parsed.slice(1);
        }
      }
    } catch {
      /* ignore */
    }
    return {
      sequence: row as unknown as OpenLabSequence,
      headers,
      rows: bodyRows,
    };
  });

export const syncOpenLabIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);

    const { data: settings } = await context.supabase
      .from("openlab_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const prefix = normalizePrefix(settings?.storage_prefix ?? "default/");

    // List Methods/ and Sequences/ under the configured prefix.
    async function listFolder(sub: string) {
      const { data, error } = await context.supabase.storage
        .from(BUCKET)
        .list(`${prefix}${sub}`, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) return [] as Array<any>;
      return data ?? [];
    }

    const methods = await listFolder("Methods");
    const sequences = await listFolder("Sequences");

    // Wipe old cache and reinsert. Scoped to the untagged/shared-project rows
    // only, so this manual bucket-based sync never wipes rows another
    // instrument synced via its own Drive folder (see openlab-drive.functions.ts).
    await context.supabase.from("openlab_methods").delete().is("instrument_id", null);
    await context.supabase.from("openlab_sequences").delete().is("instrument_id", null);

    if (methods.length) {
      const methodRows = methods
        .filter((m: any) => !/^archive$/i.test((m.name ?? "").trim()))
        // Only files at the root of /Methods — skip subfolders (storage
        // list returns folders with a null id / no metadata).
        .filter((m: any) => m.id != null && m.metadata != null)
        .map((m: any) => ({
        name: m.name.replace(/\.[Mm]$/, ""),
        description: null,
        relative_path: `${prefix}Methods/${m.name}`,
        last_modified: m.updated_at ?? m.created_at ?? null,
        size_bytes: m.metadata?.size ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await context.supabase
        .from("openlab_methods")
        .insert(methodRows);
      if (error) throw error;
    }

    if (sequences.length) {
      // For each CSV sequence, count lines by downloading (best-effort)
      const seqRows = await Promise.all(
        sequences.map(async (s: any) => {
          const path = `${prefix}Sequences/${s.name}`;
          let line_count = 0;
          if (s.name.toLowerCase().endsWith(".csv")) {
            try {
              const { data: file } = await context.supabase.storage
                .from(BUCKET)
                .download(path);
              if (file) {
                const text = await file.text();
                const parsed = parseCsv(text);
                line_count = Math.max(0, parsed.length - 1);
              }
            } catch {
              /* ignore */
            }
          }
          return {
            name: s.name.replace(/\.(csv|S)$/i, ""),
            status: "Ready",
            relative_path: path,
            last_modified: s.updated_at ?? s.created_at ?? null,
            line_count,
            synced_at: new Date().toISOString(),
          };
        }),
      );
      const { error } = await context.supabase
        .from("openlab_sequences")
        .insert(seqRows);
      if (error) throw error;
    }

    const stamp = new Date().toISOString();
    if (settings?.id) {
      await context.supabase
        .from("openlab_settings")
        .update({ last_synced_at: stamp })
        .eq("id", settings.id);
    }

    return {
      ok: true,
      methods: methods.length,
      sequences: sequences.length,
      last_synced_at: stamp,
    };
  });