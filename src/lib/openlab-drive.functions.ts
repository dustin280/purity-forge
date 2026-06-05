/**
 * Google Drive integration for the OpenLab CDS module.
 *
 * On the lab PC, Google Drive for desktop keeps a folder synced both ways
 * with the OpenLab project's Methods\ and Sequences\ subfolders. LIMS pulls
 * snapshots from Drive into the `openlab-cds` bucket and pushes generated
 * run-list CSVs back into the Sequences folder so they appear on the PC
 * automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildRunListCsv } from "@/lib/run-lists.functions";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const BUCKET = "openlab-cds";

type Kind = "Methods" | "Sequences" | "Reports";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
}

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

function gatewayHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error(
      "Google Drive is not connected. Link the Google Drive connector in Project Settings.",
    );
  }
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": ck,
  };
}

function normalizePrefix(p: string): string {
  let s = (p ?? "").trim();
  if (!s) s = "default/";
  if (!s.endsWith("/")) s += "/";
  return s.replace(/^\/+/, "");
}

async function driveList(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    "nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum)",
  );
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const r = await fetch(url, { headers: gatewayHeaders() });
    if (!r.ok) {
      throw new Error(`Drive list failed (${r.status}): ${await r.text()}`);
    }
    const json = (await r.json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    if (json.files) out.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

async function driveDownload(fileId: string): Promise<ArrayBuffer> {
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, {
    headers: gatewayHeaders(),
  });
  if (!r.ok) {
    throw new Error(`Drive download ${fileId} failed (${r.status})`);
  }
  return await r.arrayBuffer();
}

async function driveFindByName(
  folderId: string,
  name: string,
): Promise<string | null> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
  );
  const r = await fetch(
    `${GATEWAY}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`,
    { headers: gatewayHeaders() },
  );
  if (!r.ok) throw new Error(`Drive find failed (${r.status})`);
  const json = (await r.json()) as { files?: Array<{ id: string }> };
  return json.files?.[0]?.id ?? null;
}

async function driveUploadMultipart(
  folderId: string,
  name: string,
  mimeType: string,
  body: string,
): Promise<{ id: string; name: string }> {
  const boundary =
    "----lovable-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType });
  const payload =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;
  const r = await fetch(
    `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
    {
      method: "POST",
      headers: {
        ...gatewayHeaders(),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    },
  );
  if (!r.ok) {
    throw new Error(`Drive upload failed (${r.status}): ${await r.text()}`);
  }
  return (await r.json()) as { id: string; name: string };
}

async function driveUpdateMedia(
  fileId: string,
  mimeType: string,
  body: string,
): Promise<{ id: string; name: string }> {
  const r = await fetch(
    `${GATEWAY}/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name`,
    {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "Content-Type": mimeType },
      body,
    },
  );
  if (!r.ok) {
    throw new Error(`Drive update failed (${r.status}): ${await r.text()}`);
  }
  return (await r.json()) as { id: string; name: string };
}

/* ---------------- Settings ---------------- */

function extractFolderId(input: unknown): unknown {
  if (typeof input !== "string") return input;
  let s = input.trim();
  if (!s) return s;
  // If a Drive URL was pasted, pull the ID out.
  const m =
    s.match(/\/folders\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) s = m[1];
  return s;
}

const driveSettingsSchema = z.object({
  drive_methods_folder_id: z.preprocess(
    extractFolderId,
    z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
      .nullable()
      .optional(),
  ),
  drive_sequences_folder_id: z.preprocess(
    extractFolderId,
    z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
      .nullable()
      .optional(),
  ),
  drive_reports_folder_id: z.preprocess(
    extractFolderId,
    z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
      .nullable()
      .optional(),
  ),
});

export const updateDriveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => driveSettingsSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("openlab_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload = {
      drive_methods_folder_id: data.drive_methods_folder_id || null,
      drive_sequences_folder_id: data.drive_sequences_folder_id || null,
      drive_reports_folder_id: data.drive_reports_folder_id || null,
    };
    if (existing?.id) {
      const { error } = await context.supabase
        .from("openlab_settings")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("openlab_settings")
        .insert({ singleton: true, ...payload });
      if (error) throw error;
    }
    return { ok: true };
  });

/* ---------------- Test ---------------- */

export const testDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["Methods", "Sequences", "Reports"]),
        folder_id: z.preprocess(
          extractFolderId,
          z
            .string()
            .max(200)
            .regex(/^[A-Za-z0-9_\-]+$/, "Invalid Drive folder ID")
            .optional(),
        ),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    let folderId: string | null | undefined = data.folder_id;
    if (!folderId) {
      const { data: settings } = await context.supabase
        .from("openlab_settings")
        .select("drive_methods_folder_id,drive_sequences_folder_id,drive_reports_folder_id")
        .limit(1)
        .maybeSingle();
      folderId =
        data.kind === "Methods"
          ? settings?.drive_methods_folder_id
          : data.kind === "Sequences"
            ? settings?.drive_sequences_folder_id
            : settings?.drive_reports_folder_id;
    }
    if (!folderId) {
      throw new Error(`No Drive ${data.kind} folder configured`);
    }
    const files = await driveList(folderId);
    return {
      count: files.length,
      sample: files.slice(0, 5).map((f) => f.name),
    };
  });

/* ---------------- Pull ---------------- */

function parseCsvLineCount(text: string): number {
  // count non-empty lines minus header
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

async function syncKind(
  supabase: any,
  kind: Kind,
  folderId: string,
  prefix: string,
): Promise<number> {
  const files = await driveList(folderId);
  const stamp = new Date().toISOString();

  // Wipe + reinsert index rows for this kind. (Same approach used by the
  // existing manual sync in openlab.functions.ts.)
  if (kind === "Methods") {
    await supabase.from("openlab_methods").delete().neq("name", "");
  } else if (kind === "Sequences") {
    await supabase.from("openlab_sequences").delete().neq("name", "");
  } else {
    await supabase.from("openlab_reports").delete().neq("name", "");
  }

  for (const f of files) {
    const isFolder = f.mimeType === "application/vnd.google-apps.folder";

    if (isFolder) {
      // OpenLab stores methods/sequences as .M / .S directories. Index the
      // folder itself as a single entry; do not download contents.
      const path = `${prefix}${kind}/${f.name}/`;

      if (kind === "Methods") {
        const { error } = await supabase.from("openlab_methods").insert({
          name: f.name.replace(/\.[Mm]$/, ""),
          description: null,
          relative_path: path,
          last_modified: f.modifiedTime ?? null,
          size_bytes: null,
          synced_at: stamp,
        });
        if (error) throw error;
      } else if (kind === "Sequences") {
        // Best-effort: look inside the .S folder for a sequence table file
        // and count its lines. Swallow errors so one bad folder doesn't
        // abort the whole pull.
        let lineCount = 0;
        try {
          const children = await driveList(f.id);
          const table = children.find((c) =>
            /\.(csv|seq|s)$/i.test(c.name) &&
            c.mimeType !== "application/vnd.google-apps.folder",
          );
          if (table) {
            const bytes = await driveDownload(table.id);
            lineCount = parseCsvLineCount(new TextDecoder().decode(bytes));
          }
        } catch {
          /* ignore */
        }
        const { error } = await supabase.from("openlab_sequences").insert({
          name: f.name.replace(/\.[Ss]$/, ""),
          status: "Ready",
          relative_path: path,
          last_modified: f.modifiedTime ?? null,
          line_count: lineCount,
          synced_at: stamp,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("openlab_reports").insert({
          name: f.name,
          relative_path: path,
          last_modified: f.modifiedTime ?? null,
          size_bytes: null,
          synced_at: stamp,
        });
        if (error) throw error;
      }
      continue;
    }

    // Flat-file layout: download and store the file itself.
    const bytes = await driveDownload(f.id);
    const path = `${prefix}${kind}/${f.name}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([bytes]), {
        upsert: true,
        contentType: f.mimeType || undefined,
      });
    if (upErr) throw upErr;

    if (kind === "Methods") {
      const { error } = await supabase.from("openlab_methods").insert({
        name: f.name.replace(/\.[Mm]$/, ""),
        description: null,
        relative_path: path,
        last_modified: f.modifiedTime ?? null,
        size_bytes: f.size ? Number(f.size) : null,
        synced_at: stamp,
      });
      if (error) throw error;
    } else if (kind === "Sequences") {
      let lineCount = 0;
      if (f.name.toLowerCase().endsWith(".csv")) {
        lineCount = parseCsvLineCount(new TextDecoder().decode(bytes));
      }
      const { error } = await supabase.from("openlab_sequences").insert({
        name: f.name.replace(/\.(csv|S)$/i, ""),
        status: "Ready",
        relative_path: path,
        last_modified: f.modifiedTime ?? null,
        line_count: lineCount,
        synced_at: stamp,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("openlab_reports").insert({
        name: f.name,
        relative_path: path,
        last_modified: f.modifiedTime ?? null,
        size_bytes: f.size ? Number(f.size) : null,
        synced_at: stamp,
      });
      if (error) throw error;
    }
  }

  return files.length;
}

export const pullDriveSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        methods_folder_id: z.preprocess(
          extractFolderId,
          z
            .string()
            .max(200)
            .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
            .optional(),
        ),
        sequences_folder_id: z.preprocess(
          extractFolderId,
          z
            .string()
            .max(200)
            .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
            .optional(),
        ),
        reports_folder_id: z.preprocess(
          extractFolderId,
          z
            .string()
            .max(200)
            .regex(/^[A-Za-z0-9_\-]*$/, "Invalid Drive folder ID")
            .optional(),
        ),
      })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: settings } = await context.supabase
      .from("openlab_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (!settings) throw new Error("OpenLab settings not configured");
    const prefix = normalizePrefix(settings.storage_prefix ?? "default/");

    const methodsId =
      (data?.methods_folder_id && data.methods_folder_id.length > 0
        ? data.methods_folder_id
        : settings.drive_methods_folder_id) || null;
    const sequencesId =
      (data?.sequences_folder_id && data.sequences_folder_id.length > 0
        ? data.sequences_folder_id
        : settings.drive_sequences_folder_id) || null;
    const reportsId =
      (data?.reports_folder_id && data.reports_folder_id.length > 0
        ? data.reports_folder_id
        : settings.drive_reports_folder_id) || null;

    if (!methodsId && !sequencesId && !reportsId) {
      throw new Error(
        "No Drive folders configured. Enter a Methods, Sequences, or Reports folder ID first.",
      );
    }

    let methods = 0;
    let sequences = 0;
    let reports = 0;
    if (methodsId) {
      methods = await syncKind(
        context.supabase,
        "Methods",
        methodsId,
        prefix,
      );
    }
    if (sequencesId) {
      sequences = await syncKind(
        context.supabase,
        "Sequences",
        sequencesId,
        prefix,
      );
    }
    if (reportsId) {
      reports = await syncKind(
        context.supabase,
        "Reports",
        reportsId,
        prefix,
      );
    }

    const stamp = new Date().toISOString();
    await context.supabase
      .from("openlab_settings")
      .update({ drive_last_pulled_at: stamp, last_synced_at: stamp })
      .eq("id", settings.id);

    return { ok: true, methods, sequences, reports, last_pulled_at: stamp };
  });

/* ---------------- Push ---------------- */

export const pushRunListToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ run_list_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: settings } = await context.supabase
      .from("openlab_settings")
      .select("id,drive_sequences_folder_id")
      .limit(1)
      .maybeSingle();
    const folderId = settings?.drive_sequences_folder_id;
    if (!folderId) {
      throw new Error(
        "No Drive Sequences folder configured. Set it in Instrument Communication \u2192 Settings.",
      );
    }

    // Reuse the shared CSV builder so the file pushed to Drive is bit-identical
    // to what the analyst downloads from the "Download & Export" button.
    const csvResult = await buildRunListCsv(
      context.supabase,
      context.userId,
      data.run_list_id,
      true,
    );

    const existingId = await driveFindByName(folderId, csvResult.filename);
    const uploaded = existingId
      ? await driveUpdateMedia(existingId, "text/csv", csvResult.csv)
      : await driveUploadMultipart(
          folderId,
          csvResult.filename,
          "text/csv",
          csvResult.csv,
        );

    const stamp = new Date().toISOString();
    await context.supabase.from("openlab_drive_pushes").insert({
      run_list_id: data.run_list_id,
      drive_file_id: uploaded.id,
      drive_file_name: uploaded.name,
      pushed_by: context.userId,
    });
    if (settings?.id) {
      await context.supabase
        .from("openlab_settings")
        .update({ drive_last_pushed_at: stamp })
        .eq("id", settings.id);
    }

    return {
      ok: true,
      drive_file_id: uploaded.id,
      drive_file_name: uploaded.name,
      pushed_at: stamp,
    };
  });