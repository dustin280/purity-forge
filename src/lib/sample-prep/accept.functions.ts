/**
 * Accepting a generated preparation plan: draft -> in_progress, plus build
 * and push the controlled PDF to the LM-SamplePrep Drive folder in the same
 * call. Drive mechanics mirror the connector-gateway pattern already used
 * in src/lib/openlab-drive.functions.ts (same gateway, same auth headers,
 * same find-by-name upsert) — duplicated locally rather than imported
 * because this needs a binary-safe upload path (the existing
 * driveUploadMultipart/driveUpdateMedia there are string-bodied and would
 * corrupt a PDF's bytes; CSV, their only caller today, is text-safe).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSamplePrepPdf, type SamplePrepPdfStep } from "./sample-prep-pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error("Google Drive is not connected. Link the Google Drive connector in Project Settings.");
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

async function driveFindByName(folderId: string, name: string): Promise<string | null> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${escaped}' and trashed = false`);
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`, { headers: gatewayHeaders() });
  if (!r.ok) throw new Error(`Drive find failed (${r.status})`);
  const json = (await r.json()) as { files?: Array<{ id: string }> };
  return json.files?.[0]?.id ?? null;
}

async function driveCreateMetadata(folderId: string, name: string, mimeType: string): Promise<string> {
  const r = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [folderId], mimeType }),
  });
  if (!r.ok) throw new Error(`Drive create failed (${r.status}): ${await r.text()}`);
  const json = (await r.json()) as { id: string };
  return json.id;
}

async function driveUpdateMediaBinary(fileId: string, mimeType: string, bytes: ArrayBuffer): Promise<void> {
  const r = await fetch(`${GATEWAY}/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { ...gatewayHeaders(), "Content-Type": mimeType },
    body: bytes,
  });
  if (!r.ok) throw new Error(`Drive upload failed (${r.status}): ${await r.text()}`);
}

async function pushPdfToDrive(folderId: string, filename: string, bytes: ArrayBuffer): Promise<{ file_id: string; file_name: string }> {
  const existingId = await driveFindByName(folderId, filename);
  const fileId = existingId ?? await driveCreateMetadata(folderId, filename, "application/pdf");
  await driveUpdateMediaBinary(fileId, "application/pdf", bytes);
  return { file_id: fileId, file_name: filename };
}

function safeFileNamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export const acceptSamplePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prep_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };

    const { data: record, error: recErr } = await supabase
      .from("sp_preparation_records")
      .select("id, prep_number, status, method_revision_id, analyte_id, sample_id, sample_context, plan, planned_target_concentration_mg_per_ml, planned_calibration_level")
      .eq("id", data.prep_id).single();
    if (recErr) throw recErr;
    if (record.status !== "draft") throw new Error(`Only draft records can be accepted (current status: ${record.status}).`);

    const [{ data: steps, error: stepsErr }, { data: revision }, { data: analyte }, { data: settings }, { data: profile }] = await Promise.all([
      supabase.from("sp_preparation_steps").select("*").eq("record_id", data.prep_id).order("step_no"),
      supabase.from("sp_method_revisions").select("version, revision, method_id").eq("id", record.method_revision_id).maybeSingle(),
      supabase.from("sp_analytes").select("canonical_name").eq("id", record.analyte_id).maybeSingle(),
      supabase.from("sp_settings").select("drive_lm_sample_prep_folder_id").eq("id", true).maybeSingle(),
      supabase.from("profiles").select("first_name, last_name, full_name, email").eq("id", userId).maybeSingle(),
    ]);
    if (stepsErr) throw stepsErr;
    if (!settings?.drive_lm_sample_prep_folder_id) {
      throw new Error("LM-SamplePrep Drive folder is not configured. Set it in Sample Prep → Settings first.");
    }

    let methodName = "Method";
    if (revision?.method_id) {
      const { data: method } = await supabase.from("sp_methods").select("name").eq("id", revision.method_id).maybeSingle();
      methodName = method?.name ?? methodName;
    }

    const stepRows = (steps ?? []) as Array<{ step_no: number; planned: { instruction?: string; suggested_vessel_id?: string | null; suggested_equipment_id?: string | null } }>;
    const vesselIds = Array.from(new Set(stepRows.map(s => s.planned?.suggested_vessel_id).filter(Boolean))) as string[];
    const equipIds = Array.from(new Set(stepRows.map(s => s.planned?.suggested_equipment_id).filter(Boolean))) as string[];
    const [{ data: vesselRows }, { data: equipRows }] = await Promise.all([
      vesselIds.length ? supabase.from("sp_vessels").select("id, name").in("id", vesselIds) : Promise.resolve({ data: [] }),
      equipIds.length ? supabase.from("sp_equipment").select("id, equipment_id, equipment_type, manufacturer, model").in("id", equipIds) : Promise.resolve({ data: [] }),
    ]);
    const vesselNameById = new Map(((vesselRows ?? []) as Array<{ id: string; name: string }>).map(v => [v.id, v.name] as const));
    const equipLabelById = new Map(((equipRows ?? []) as Array<{ id: string; equipment_id: string | null; equipment_type: string; manufacturer: string | null; model: string | null }>)
      .map(e => [e.id, [e.manufacturer, e.model, e.equipment_id].filter(Boolean).join(" ") || e.equipment_type] as const));

    const pdfSteps: SamplePrepPdfStep[] = stepRows.map(s => ({
      ordinal: s.step_no,
      instruction: s.planned?.instruction ?? "",
      vesselName: s.planned?.suggested_vessel_id ? vesselNameById.get(s.planned.suggested_vessel_id) ?? null : null,
      equipmentLabel: s.planned?.suggested_equipment_id ? equipLabelById.get(s.planned.suggested_equipment_id) ?? null : null,
    }));

    const ctx = (record.sample_context ?? {}) as { compound?: string };
    const planBlob = (record.plan ?? {}) as { warnings?: string[] };
    const preparedByName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
      || profile?.full_name || profile?.email || "Unknown";
    const preparedAt = new Date().toISOString();

    const doc = buildSamplePrepPdf({
      prepNumber: record.prep_number,
      batchId: record.sample_id,
      compound: ctx.compound ?? null,
      analyteName: analyte?.canonical_name ?? "—",
      methodName,
      methodVersion: revision ? `${revision.version}.${revision.revision}` : "—",
      asReceivedSummary: record.plan?.stockConcentrationMgPerMl != null
        ? `Stock ${Number(record.plan.stockConcentrationMgPerMl).toPrecision(4)} mg/mL`
        : "—",
      targetConcentrationDisplay: record.planned_target_concentration_mg_per_ml != null
        ? `${record.planned_target_concentration_mg_per_ml} mg/mL`
        : "—",
      calibrationLevel: record.planned_calibration_level,
      steps: pdfSteps,
      warnings: planBlob.warnings ?? [],
      preparedByName,
      preparedAt,
    });
    const bytes = doc.output("arraybuffer") as ArrayBuffer;

    const filename = `${safeFileNamePart(record.sample_id ?? "sample")}_${safeFileNamePart(record.prep_number)}.pdf`;
    const drive = await pushPdfToDrive(settings.drive_lm_sample_prep_folder_id, filename, bytes);

    const { error: updErr } = await supabase
      .from("sp_preparation_records")
      .update({
        status: "in_progress",
        prepared_at: preparedAt,
        plan: { ...(record.plan ?? {}), drive_file_id: drive.file_id, drive_file_name: drive.file_name },
      })
      .eq("id", data.prep_id);
    if (updErr) throw updErr;

    return { ok: true, drive_file_name: drive.file_name };
  });
