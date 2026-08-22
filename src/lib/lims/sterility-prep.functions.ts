/**
 * USP <71> sterility prep + 14-day incubation tracking. One row per
 * sterility test's inoculation event, created by prepAndInoculateSterility
 * (which also places the sample in an incubator via the existing
 * assignSlotForSample — see storage-assignment.functions.ts). The final
 * readout itself still lives in nonchrom_results as before (saveNonchromResult);
 * "read out" here just means a nonchrom_results row now exists for the test.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assignSlotForSample } from "@/lib/lims/storage-assignment.functions";

export interface MediaLot {
  receiptId: string;
  lotNumber: string;
  materialName: string;
  expiryDate: string | null;
}

// FTM/TSB are received under a handful of common naming variants — matched
// broadly rather than exactly, since material_name is free text at
// receiving. A too-narrow match just shows "no lots found" (safe failure),
// never a wrong-lot risk.
const MEDIA_NAME_PATTERNS: Record<"FTM" | "TSB", string[]> = {
  FTM: ["%FTM%", "%Fluid Thioglycollate%", "%Thioglycollate%"],
  TSB: ["%TSB%", "%Tryptic Soy Broth%", "%Tryptic Soy%"],
};

export const listMediaLots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mediaName: z.enum(["FTM", "TSB"]) }).parse(d))
  .handler(async ({ context, data }): Promise<MediaLot[]> => {
    const patterns = MEDIA_NAME_PATTERNS[data.mediaName];
    const orClause = patterns.map((p) => `material_name.ilike.${p}`).join(",");
    const { data: rows, error } = await context.supabase
      .from("material_receipts")
      .select("id, material_name, manufacturer_lot, internal_lot, expiry_date")
      .or(orClause)
      .eq("quarantine_status", "released")
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const now = Date.now();
    return (rows ?? [])
      .filter((r) => !r.expiry_date || new Date(r.expiry_date).getTime() > now)
      .map((r) => ({
        receiptId: r.id,
        lotNumber: r.manufacturer_lot ?? r.internal_lot ?? "(no lot #)",
        materialName: r.material_name,
        expiryDate: r.expiry_date,
      }));
  });

export const prepAndInoculateSterility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    testId: z.string().uuid(),
    ftmReceiptId: z.string().uuid(),
    tsbReceiptId: z.string().uuid(),
    inoculationVolumeMl: z.number().positive().max(50).default(1.0),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: test, error: testErr } = await context.supabase
      .from("tests").select("sample_id").eq("id", data.testId).maybeSingle();
    if (testErr) throw testErr;
    if (!test) throw new Error("Test not found");

    const { data: receipts, error: recErr } = await context.supabase
      .from("material_receipts")
      .select("id, manufacturer_lot, internal_lot")
      .in("id", [data.ftmReceiptId, data.tsbReceiptId]);
    if (recErr) throw recErr;
    const ftm = receipts?.find((r) => r.id === data.ftmReceiptId);
    const tsb = receipts?.find((r) => r.id === data.tsbReceiptId);
    if (!ftm || !tsb) throw new Error("Selected FTM/TSB lot not found");

    const { data: prep, error: prepErr } = await context.supabase
      .from("sterility_preps")
      .insert({
        test_id: data.testId,
        sample_id: test.sample_id,
        ftm_receipt_id: ftm.id,
        ftm_lot_number: ftm.manufacturer_lot ?? ftm.internal_lot ?? null,
        tsb_receipt_id: tsb.id,
        tsb_lot_number: tsb.manufacturer_lot ?? tsb.internal_lot ?? null,
        inoculation_volume_ml: data.inoculationVolumeMl,
        prepared_by: context.userId,
      })
      .select()
      .single();
    if (prepErr) throw prepErr;

    const placement = await assignSlotForSample(context.supabase, test.sample_id, "incubator", data.testId);
    return { prep, placement };
  });

export const recordInterimCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    testId: z.string().uuid(),
    result: z.enum(["clear", "turbid"]),
    notes: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("sterility_preps")
      .update({
        interim_check_status: data.result,
        interim_check_at: new Date().toISOString(),
        interim_check_by: context.userId,
        interim_check_notes: data.notes ?? null,
      })
      .eq("test_id", data.testId);
    if (error) throw error;
    return { ok: true };
  });

export interface SterilityPrepStatus {
  prep: {
    id: string;
    ftm_lot_number: string | null;
    tsb_lot_number: string | null;
    inoculation_volume_ml: number;
    prepared_at: string;
    interim_check_status: string;
    interim_check_at: string | null;
    interim_check_notes: string | null;
  } | null;
  dayOfIncubation: number;
  interimCheckDue: boolean;
  readoutDue: boolean;
}

export const getSterilityPrep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<SterilityPrepStatus> => {
    const { data: prep, error } = await context.supabase
      .from("sterility_preps")
      .select("id, ftm_lot_number, tsb_lot_number, inoculation_volume_ml, prepared_at, interim_check_status, interim_check_at, interim_check_notes")
      .eq("test_id", data.testId)
      .maybeSingle();
    if (error) throw error;
    if (!prep) return { prep: null, dayOfIncubation: 0, interimCheckDue: false, readoutDue: false };

    const { data: settings } = await context.supabase
      .from("sp_settings").select("sterility_interim_check_day, sterility_readout_day").eq("id", true).maybeSingle();
    const interimDay = settings?.sterility_interim_check_day ?? 4;
    const readoutDay = settings?.sterility_readout_day ?? 14;

    const dayOfIncubation = Math.floor((Date.now() - new Date(prep.prepared_at).getTime()) / 86_400_000);
    return {
      prep,
      dayOfIncubation,
      interimCheckDue: prep.interim_check_status === "pending" && dayOfIncubation >= interimDay,
      readoutDue: dayOfIncubation >= readoutDay,
    };
  });
