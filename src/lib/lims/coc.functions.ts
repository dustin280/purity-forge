import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const cocFieldType = z.enum(["text", "textarea", "number", "date", "datetime", "email", "tel", "multiselect"]);

export const listCocFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chain_of_custody_fields").select("*").order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      field_key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores"),
      label: z.string().min(1).max(255).trim(),
      field_type: cocFieldType.default("text"),
      is_required: z.boolean().default(false),
      placeholder: z.string().max(255).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: maxRow } = await context.supabase
      .from("chain_of_custody_fields").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const next = ((maxRow?.sort_order as number | undefined) ?? 0) + 10;
    const { data: row, error } = await context.supabase
      .from("chain_of_custody_fields").insert({ ...data, sort_order: next }).select().single();
    if (error) throw error;
    return row;
  });

export const updateCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(255).trim().optional(),
      field_type: cocFieldType.optional(),
      is_required: z.boolean().optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
      placeholder: z.string().max(255).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("chain_of_custody_fields").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chain_of_custody_fields").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listCocRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chain_of_custody_records").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getCocRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("chain_of_custody_records").select("*").eq("id", data.id).single();
    if (error) throw error;
    return row;
  });

export const createCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().min(1).max(128),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("chain_of_custody_records")
      .insert({ sample_id: data.sample_id, data: data.data, created_by: userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      sample_id: z.string().min(1).max(128).optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])).optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("chain_of_custody_records").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chain_of_custody_records").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const nextCocInvoiceNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `COC${mm}${dd}${yy}-`;
    const { data, error } = await context.supabase
      .from("chain_of_custody_records")
      .select("sample_id")
      .like("sample_id", "COC%");
    if (error) throw error;
    let max = 99;
    for (const r of data ?? []) {
      const sid = String((r as { sample_id: string }).sample_id);
      const dash = sid.lastIndexOf("-");
      if (dash < 0) continue;
      const n = parseInt(sid.slice(dash + 1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return { invoice: `${prefix}${max + 1}` };
  });

// ============= CoC-driven intake =============

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

// ============= CoC Attachments =============

export const recordCocAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      coc_id: z.string().uuid(),
      file_path: z.string().min(1).max(1024),
      file_name: z.string().min(1).max(255),
      content_type: z.string().max(127).nullable().optional(),
      size_bytes: z.number().int().nonnegative().nullable().optional(),
      line_item_index: z.number().int().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("coc_attachments").insert({
      coc_id: data.coc_id,
      file_path: data.file_path,
      file_name: data.file_name,
      content_type: data.content_type ?? null,
      size_bytes: data.size_bytes ?? null,
      line_item_index: data.line_item_index ?? null,
      uploaded_by: userId,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const listCocAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ coc_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("coc_attachments").select("*")
      .eq("coc_id", data.coc_id)
      .order("uploaded_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const deleteCocAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("coc_attachments").select("file_path").eq("id", data.id).maybeSingle();
    if (row?.file_path) {
      await supabase.storage.from("coc-attachments").remove([row.file_path]);
    }
    const { error } = await supabase.from("coc_attachments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const signedCocAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ file_path: z.string().min(1).max(1024), expires_in: z.number().int().min(60).max(3600).default(600) }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("coc-attachments")
      .createSignedUrl(data.file_path, data.expires_in);
    if (error) throw error;
    return { url: signed.signedUrl };
  });