/**
 * Pushes a sample's vial intake photo (captured at Chain-of-Custody intake,
 * stored in the "coc-attachments" Supabase Storage bucket) into the Drive
 * "LM-Reports Complete" folder, named "${batch_id}.<ext>" so it's associated
 * with its sample. Two callers: a manual per-sample button
 * (src/components/samples/info-tab.tsx) and a best-effort hook fired for
 * every newly-created sample at intake (coc-intake.functions.ts). Never
 * throws — a missing photo or a Drive hiccup must never block intake or
 * confuse an analyst clicking the manual button outside a try/catch of
 * their own.
 *
 * Originally converted to PNG server-side via @cf-wasm/photon, but Cloudflare
 * Workers blocks dynamically compiling WebAssembly from raw bytes at runtime
 * ("WebAssembly.instantiate(): Wasm code generation disallowed by embedder"
 * — confirmed live, after also working around a separate Rollup build
 * incompatibility with that library's own .wasm import). Confirmed with
 * Wayne that the original JPEG is fine to receive as-is, so this just
 * relays the photo's original bytes/content-type through unchanged.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadReportsFolderId } from "@/lib/results/drive-reports.functions";
import type { SupabaseClient } from "@supabase/supabase-js";

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

// Duplicated locally rather than imported, matching this codebase's
// established convention for Drive-gateway helpers (see the header comment
// in src/lib/results/drive-reports.functions.ts) — each Drive-writing
// module keeps its own copy rather than sharing one.
function driveHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error(
      "Google Drive is not connected. Link the Google Drive connector in Project Settings.",
    );
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

async function driveFindByName(folderId: string, name: string): Promise<string | null> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
  );
  const r = await fetch(`${DRIVE_GATEWAY}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`, {
    headers: driveHeaders(),
  });
  if (!r.ok) throw new Error(`Drive find failed (${r.status}): ${await r.text()}`);
  const j = (await r.json()) as { files?: Array<{ id: string }> };
  return j.files?.[0]?.id ?? null;
}

// Multipart body built as a Blob (not a string) so the binary PNG bytes
// aren't corrupted by JS string coercion — the existing driveUpload() in
// src/lib/run-lists/generate.functions.ts string-concatenates its body,
// which only works because it's always CSV text, not binary image data.
async function driveUploadBinary(
  folderId: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<{ id: string; name: string }> {
  const boundary = "----lovable-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`,
  ]);
  const r = await fetch(
    `${DRIVE_GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
    {
      method: "POST",
      headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!r.ok) throw new Error(`Drive upload failed (${r.status}): ${await r.text()}`);
  return (await r.json()) as { id: string; name: string };
}

async function driveUpdateBinary(
  fileId: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<{ id: string; name: string }> {
  const r = await fetch(
    `${DRIVE_GATEWAY}/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name`,
    {
      method: "PATCH",
      headers: { ...driveHeaders(), "Content-Type": mimeType },
      body: bytes,
    },
  );
  if (!r.ok) throw new Error(`Drive update failed (${r.status}): ${await r.text()}`);
  return (await r.json()) as { id: string; name: string };
}

/**
 * `coc_attachments` has no direct FK to `samples` — the join is indirect
 * via `coc_id` (+ optional `line_item_index`). Prefers an exact
 * line-item-index match (one photo per vial line item, confirmed against
 * real intake data) and falls back to a `line_item_index IS NULL` row
 * (a whole-CoC/package photo) if no per-line photo exists.
 */
async function findVialPhotoAttachment(
  supabase: SupabaseClient,
  cocId: string,
  lineItemIndex: number | null,
): Promise<{ file_path: string; content_type: string | null } | null> {
  const { data: rows } = await supabase
    .from("coc_attachments")
    .select("file_path, content_type, line_item_index")
    .eq("coc_id", cocId);
  if (!rows || rows.length === 0) return null;
  const exact = rows.find((r) => r.line_item_index === lineItemIndex);
  if (exact) return exact;
  return rows.find((r) => r.line_item_index === null) ?? null;
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export interface VialPhotoSyncResult {
  ok: boolean;
  reason?: string;
  drive_file_id?: string;
  drive_file_name?: string;
}

export async function pushVialPhotoToReportsDrive(
  supabase: SupabaseClient,
  sample: { batch_id: string; coc_id: string | null; line_item_index: number | null },
): Promise<VialPhotoSyncResult> {
  try {
    if (!sample.coc_id) return { ok: false, reason: "sample has no coc_id" };
    const attachment = await findVialPhotoAttachment(
      supabase,
      sample.coc_id,
      sample.line_item_index,
    );
    if (!attachment) return { ok: false, reason: "no vial photo found for this sample" };

    const { data: file, error: dlError } = await supabase.storage
      .from("coc-attachments")
      .download(attachment.file_path);
    if (dlError || !file)
      return { ok: false, reason: `could not download photo: ${dlError?.message ?? "unknown"}` };

    const mimeType = attachment.content_type ?? "image/jpeg";
    const ext = EXT_BY_CONTENT_TYPE[mimeType] ?? "jpg";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const folderId = await loadReportsFolderId(supabase);
    const name = `${sample.batch_id}.${ext}`;

    const existingId = await driveFindByName(folderId, name);
    const uploaded = existingId
      ? await driveUpdateBinary(existingId, bytes, mimeType)
      : await driveUploadBinary(folderId, name, bytes, mimeType);

    return { ok: true, drive_file_id: uploaded.id, drive_file_name: uploaded.name };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Best-effort hook for the intake flow — called once per batch of
 * newly-created samples right after submitCocWithSamples inserts them.
 * Mirrors notifyNewIntake's shape (src/lib/notifications/notifications.functions.ts):
 * never throws, failures are logged server-side only, never blocks intake.
 */
export async function syncVialPhotosForNewSamples(
  supabase: SupabaseClient,
  samples: Array<{ batch_id: string; coc_id: string | null; line_item_index: number | null }>,
): Promise<void> {
  try {
    const results = await Promise.allSettled(
      samples.map((s) => pushVialPhotoToReportsDrive(supabase, s)),
    );
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === "rejected") {
        console.error(`syncVialPhotosForNewSamples: ${samples[i].batch_id} threw`, res.reason);
      } else if (!res.value.ok) {
        console.error(
          `syncVialPhotosForNewSamples: ${samples[i].batch_id} skipped — ${res.value.reason}`,
        );
      }
    }
  } catch (e) {
    console.error("syncVialPhotosForNewSamples failed", e);
  }
}

export const syncVialPhotoToReportsDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sample_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<VialPhotoSyncResult> => {
    const { data: sample, error } = await context.supabase
      .from("samples")
      .select("batch_id, coc_id, line_item_index")
      .eq("id", data.sample_id)
      .maybeSingle();
    if (error || !sample) return { ok: false, reason: "sample not found" };
    return pushVialPhotoToReportsDrive(context.supabase, sample);
  });
