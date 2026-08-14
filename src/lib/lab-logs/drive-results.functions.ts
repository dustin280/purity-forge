/**
 * Drive access for the automated HPLC backpressure watcher. Lists the
 * per-run result folders in the "Results" Drive folder and the Agilent
 * OpenLab `.dx` trace files inside each one.
 *
 * Drive mechanics mirror the connector-gateway pattern already used in
 * src/lib/results/drive-reports.functions.ts, src/lib/openlab-drive.functions.ts,
 * and src/lib/sample-prep/accept.functions.ts — duplicated locally per the
 * existing convention in this codebase rather than sharing a module.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error("Google Drive is not connected. Link the Google Drive connector in Project Settings.");
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DX_MIME_TYPE = "chemical/x-jcamp-dx";

export type DriveEntry = { id: string; name: string; modifiedTime?: string };

export async function driveListFolders(parentId: string): Promise<DriveEntry[]> {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=modifiedTime desc`, {
    headers: gatewayHeaders(),
  });
  if (!r.ok) throw new Error(`Drive list folders failed (${r.status}): ${await r.text()}`);
  const json = (await r.json()) as { files?: DriveEntry[] };
  return json.files ?? [];
}

export async function driveListDxFiles(folderId: string): Promise<DriveEntry[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = '${DX_MIME_TYPE}'`);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=name`, {
    headers: gatewayHeaders(),
  });
  if (!r.ok) throw new Error(`Drive list .dx files failed (${r.status}): ${await r.text()}`);
  const json = (await r.json()) as { files?: DriveEntry[] };
  // Filenames are timestamp-prefixed (e.g. "2026-08-12 06-48-24-07-00-01.dx"),
  // so lexical order on name is also chronological order — the first
  // injection of the sequence sorts first.
  return (json.files ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function driveDownload(fileId: string): Promise<ArrayBuffer> {
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, { headers: gatewayHeaders() });
  if (!r.ok) throw new Error(`Drive download ${fileId} failed (${r.status})`);
  return await r.arrayBuffer();
}

export async function loadResultsFolderId(supabase: import("@supabase/supabase-js").SupabaseClient): Promise<string> {
  const { data } = await supabase.from("sp_settings").select("drive_hplc_results_folder_id").eq("id", true).maybeSingle();
  const folderId = data?.drive_hplc_results_folder_id;
  if (!folderId) throw new Error("HPLC Results Drive folder is not configured. Set it in Sample Prep → Settings first.");
  return folderId;
}
