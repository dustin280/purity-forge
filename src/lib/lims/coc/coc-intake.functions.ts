import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const lineItemSchema = z.object({
  compound: z.string().min(1).max(255),
  lot: z.string().max(255).optional().nullable(),
  catalog: z.string().max(255).optional().nullable(),
  manufacturer: z.string().max(255).optional().nullable(),
  quantity: z.string().max(64).optional().nullable(),
  quantity_unit: z.string().max(32).optional().nullable(),
  container_size: z.string().max(128).optional().nullable(),
  concentration: z.string().max(128).optional().nullable(),
  vial_count: z.number().int().min(1).max(99).optional().default(1),
  storage: z.string().max(255).optional().nullable(),
  temperature_c: z.union([z.number(), z.string()]).optional().nullable(),
  client_received_date: z.string().max(32).optional().nullable(),
  manufacture_date: z.string().max(32).optional().nullable(),
  physical_description: z.string().max(2000).optional().nullable(),
  requested_tests: z.array(z.string().min(1).max(128)).max(200).optional().default([]),
});

export const submitCocWithSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().min(1).max(128),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])),
      line_items: z.array(lineItemSchema).min(1).max(200),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const headerClient = (typeof data.data.client_company === "string" ? data.data.client_company : "") || "Unknown";
    const headerProject = (typeof data.data.project === "string" ? data.data.project : null);
    const receiptRaw = (typeof data.data.date_received === "string" ? data.data.date_received : "")
      || (typeof data.data.client_received_date === "string" ? data.data.client_received_date : "")
      || new Date().toISOString().slice(0, 10);
    const receiptDate = receiptRaw.slice(0, 10);

    const { data: coc, error: cocErr } = await supabase
      .from("chain_of_custody_records")
      .insert({
        sample_id: data.sample_id,
        data: data.data,
        line_items: data.line_items,
        created_by: userId,
      })
      .select()
      .single();
    if (cocErr) throw cocErr;

    type SampleInsert = {
      batch_id: string; client: string; project: string | null;
      receipt_date: string; parameters: string[]; notes: string | null;
      coc_id: string; coc_line_no: number; compound: string;
      lot: string | null; catalog: string | null;
      container_size: string | null; concentration: string | null;
      temperature_c: number | null; line_item_index: number;
      client_received_date: string | null; manufacture_date: string | null;
      physical_description: string | null;
      created_by: string; status: "received";
    };
    const rows: SampleInsert[] = [];
    let seq = 0;
    data.line_items.forEach((li, lineIdx) => {
      const vials = Math.max(1, li.vial_count ?? 1);
      const params = li.requested_tests ?? [];
      const tempNum = (() => {
        if (li.temperature_c == null || li.temperature_c === "") return null;
        const n = typeof li.temperature_c === "number" ? li.temperature_c : Number(li.temperature_c);
        return isNaN(n) ? null : n;
      })();
      for (let v = 0; v < vials; v++) {
        seq += 1;
        const sampleId = `${data.sample_id}-${String(seq).padStart(2, "0")}`;
        rows.push({
          batch_id: sampleId,
          client: headerClient,
          project: headerProject,
          receipt_date: receiptDate,
          parameters: params,
          notes: li.catalog ? `Catalog: ${li.catalog}` : null,
          coc_id: coc.id,
          coc_line_no: seq,
          compound: li.compound,
          lot: li.lot ?? null,
          catalog: li.catalog ?? null,
          container_size: li.container_size ?? null,
          concentration: li.concentration ?? null,
          temperature_c: tempNum,
          line_item_index: lineIdx,
          client_received_date: (li.client_received_date && li.client_received_date.trim()) ? li.client_received_date.slice(0, 10) : null,
          manufacture_date: (li.manufacture_date && li.manufacture_date.trim()) ? li.manufacture_date.slice(0, 10) : null,
          physical_description: (li.physical_description && li.physical_description.trim()) ? li.physical_description : null,
          created_by: userId,
          status: "received" as const,
        });
      }
    });
    const { data: samples, error: sErr } = await supabase
      .from("samples")
      .insert(rows)
      .select();
    if (sErr) throw sErr;
    return { coc, samples: samples ?? [] };
  });

export const listIntakeQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("samples")
      .select("*")
      .eq("status", "received")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const verifySampleIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      client: z.string().min(1).max(255),
      project: z.string().max(255).optional().nullable(),
      compound: z.string().min(1).max(255),
      lot: z.string().max(255).optional().nullable(),
      parameters: z.array(z.string().min(1).max(128)).max(200),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("samples")
      .update({
        client: data.client,
        project: data.project,
        compound: data.compound,
        lot: data.lot,
        parameters: data.parameters,
        notes: data.notes,
        status: "prep",
      })
      .eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: "intake_verified",
      table_name: "samples",
      record_id: data.sampleId,
      changed_by: userId,
      diff: { status: "prep" },
    });
    const { data: existing } = await supabase.from("tests").select("id").eq("sample_id", data.sampleId).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("tests").insert({
        sample_id: data.sampleId,
        method_name: "Peptide Purity HPLC-DAD",
        instrument: "Agilent 1290 DAD",
        assigned_tech: userId,
      });
    }
    return { ok: true };
  });