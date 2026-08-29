import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { notifyNewIntake } from "@/lib/notifications/notifications.functions";
import { provisionTestsForSample, provisionTestForVial } from "@/lib/lims/test-provisioning";
import { syncVialPhotosForNewSamples } from "@/lib/lims/coc/vial-photo-drive-sync.functions";
import { assignStorageForNewSamples } from "@/lib/lims/storage-assignment.functions";
import { lotCode, vialBatchId, composeAppearance } from "@/lib/lims/sample-hierarchy";

const lineItemComponentSchema = z.object({
  compound_id: z.string().uuid().optional().nullable(),
  compound: z.string().max(255).optional().default(""),
  label_content_value: z.union([z.number(), z.string()]).optional().nullable(),
  label_content_unit: z.enum(["mg", "ug", ""]).optional().nullable(),
});

const lineItemSchema = z.object({
  compound: z.string().min(1).max(255),
  compound_id: z.string().uuid().optional().nullable(),
  partner_reported_name: z.string().max(255).optional().nullable(),
  lot: z.string().max(255).optional().nullable(),
  catalog: z.string().max(255).optional().nullable(),
  manufacturer: z.string().max(255).optional().nullable(),
  container_size: z.string().max(128).optional().nullable(),
  vial_count: z.number().int().min(1).max(99).optional().default(1),
  client_received_date: z.string().max(32).optional().nullable(),
  manufacture_date: z.string().max(32).optional().nullable(),
  physical_description: z.string().max(2000).optional().nullable(),
  requested_tests: z.array(z.string().min(1).max(128)).max(200).optional().default([]),
  physical_form: z.enum(["solid", "liquid", "capsule", ""]).optional().nullable(),
  label_content_value: z.union([z.number(), z.string()]).optional().nullable(),
  label_content_unit: z.enum(["mg", "ug", ""]).optional().nullable(),
  is_multi_component: z.boolean().optional().default(false),
  components: z.array(lineItemComponentSchema).max(20).optional().default([]),
  bottle_size: z.string().max(128).optional().nullable(),
  liquid_volume_ml: z.union([z.number(), z.string()]).optional().nullable(),
  label_content_basis: z.enum(["per_ml", "per_bottle", ""]).optional().nullable(),
  capsule_count: z.union([z.number(), z.string()]).optional().nullable(),
});

/** Derives the legacy solid/liquid received_form + quantity fields the
 * Sample Prep dilution engine reads, from the new physical-form line item.
 * Capsules have no equivalent yet (dilution planning isn't modeled for
 * them) — left null, which Sample Prep already surfaces as a clear
 * "needs input" gap rather than guessing. */
function deriveReceivedFields(li: z.infer<typeof lineItemSchema>): {
  received_form: "lyophilized" | "solution" | null;
  received_quantity: number | null;
  received_quantity_unit: string | null;
  concentration: string | null;
} {
  const val =
    li.label_content_value == null || li.label_content_value === ""
      ? null
      : Number(li.label_content_value);
  const unit = li.label_content_unit || null;
  if (li.physical_form === "solid") {
    return {
      received_form: "lyophilized",
      received_quantity: val,
      received_quantity_unit: unit,
      concentration: null,
    };
  }
  if (li.physical_form === "liquid") {
    let concentration: string | null = null;
    if (val != null && unit) {
      if (li.label_content_basis === "per_bottle" && li.liquid_volume_ml) {
        const vol = Number(li.liquid_volume_ml);
        if (!isNaN(vol) && vol > 0) concentration = `${(val / vol).toFixed(4)} ${unit}/mL`;
      } else {
        concentration = `${val} ${unit}/mL`;
      }
    }
    return {
      received_form: "solution",
      received_quantity: null,
      received_quantity_unit: null,
      concentration,
    };
  }
  return {
    received_form: null,
    received_quantity: null,
    received_quantity_unit: null,
    concentration: null,
  };
}

// ---------------------------------------------------------------------------
// Three-level intake (shipment -> lot -> vial). See sample-hierarchy.ts.
// ---------------------------------------------------------------------------

const vialSchema = z.object({
  test_type: z.enum(["purity", "sterility", "endotoxin", "heavy_metals"]),
  /** The partner's OWN per-vial lot string. Stored verbatim on samples.lot
   *  because the partner export API is polled by exactly this value -- it
   *  has to keep resolving to this individual vial. Blank for vials we
   *  added ourselves (e.g. a heavy-metals vial absent from their manifest),
   *  which fall back to the lot's base customer lot. */
  partner_lot: z.string().max(255).optional().nullable(),
  physical_description: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const lotSchema = z.object({
  customer_lot: z.string().max(255).optional().nullable(),
  compound: z.string().min(1).max(255),
  compound_id: z.string().uuid().optional().nullable(),
  partner_reported_name: z.string().max(255).optional().nullable(),
  catalog: z.string().max(255).optional().nullable(),
  manufacturer: z.string().max(255).optional().nullable(),
  container_size: z.string().max(128).optional().nullable(),
  client_received_date: z.string().max(32).optional().nullable(),
  manufacture_date: z.string().max(32).optional().nullable(),
  physical_form: z.enum(["solid", "liquid", "capsule", ""]).optional().nullable(),
  appearance_texture: z.string().max(64).optional().nullable(),
  appearance_texture_other: z.string().max(128).optional().nullable(),
  appearance_color: z.string().max(64).optional().nullable(),
  label_content_value: z.union([z.number(), z.string()]).optional().nullable(),
  label_content_unit: z.enum(["mg", "ug", ""]).optional().nullable(),
  is_multi_component: z.boolean().optional().default(false),
  components: z.array(lineItemComponentSchema).max(20).optional().default([]),
  bottle_size: z.string().max(128).optional().nullable(),
  liquid_volume_ml: z.union([z.number(), z.string()]).optional().nullable(),
  label_content_basis: z.enum(["per_ml", "per_bottle", ""]).optional().nullable(),
  capsule_count: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  vials: z.array(vialSchema).min(1).max(99),
});

export const submitCocWithLots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sample_id: z.string().min(1).max(128),
        data: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
        ),
        lots: z.array(lotSchema).min(1).max(200),
        pending_order_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const headerClient =
      (typeof data.data.client_company === "string" ? data.data.client_company : "") || "Unknown";
    const headerProject = typeof data.data.project === "string" ? data.data.project : null;
    const receiptRaw =
      (typeof data.data.date_received === "string" ? data.data.date_received : "") ||
      (typeof data.data.client_received_date === "string" ? data.data.client_received_date : "") ||
      new Date().toISOString().slice(0, 10);
    const receiptDate = receiptRaw.slice(0, 10);

    const { data: candidateClients } = await supabase.from("clients").select("id,company_name");
    const matchedClient =
      (candidateClients ?? []).find(
        (c) => c.company_name.trim().toLowerCase() === headerClient.trim().toLowerCase(),
      ) ?? null;

    const { data: candidateCompounds } = await supabase
      .from("compounds")
      .select("id,name,method_group_id");
    const methodGroupByCompoundId = new Map(
      (candidateCompounds ?? []).map((c) => [c.id as string, c.method_group_id as string | null]),
    );
    const methodGroupByCompoundName = new Map(
      (candidateCompounds ?? []).map((c) => [
        c.name.trim().toLowerCase(),
        c.method_group_id as string | null,
      ]),
    );

    const { data: coc, error: cocErr } = await supabase
      .from("chain_of_custody_records")
      .insert({
        sample_id: data.sample_id,
        data: data.data,
        line_items: data.lots as never,
        created_by: userId,
      })
      .select()
      .single();
    if (cocErr) throw cocErr;

    const createdSamples: Array<{ id: string; batch_id: string; test_type: string; coc_id: string; line_item_index: number; physical_form: string | null }> = [];

    for (const [lotIdx, lot] of data.lots.entries()) {
      const lotNo = lotIdx + 1;
      const appearance = composeAppearance(
        lot.physical_form, lot.appearance_color, lot.appearance_texture, lot.appearance_texture_other,
      );
      const labelContentNum = (() => {
        if (lot.label_content_value == null || lot.label_content_value === "") return null;
        const n = Number(lot.label_content_value);
        return isNaN(n) ? null : n;
      })();

      const { data: lotRow, error: lotErr } = await supabase
        .from("sample_lots")
        .insert({
          coc_id: coc.id,
          shipment_id: data.sample_id,
          lot_no: lotNo,
          lot_code: lotCode(data.sample_id, lotNo),
          customer_lot: lot.customer_lot || null,
          compound: lot.compound,
          compound_id: lot.compound_id ?? null,
          partner_reported_compound_name: lot.partner_reported_name || null,
          is_multi_component: !!lot.is_multi_component,
          components: (lot.is_multi_component ? (lot.components ?? []) : []) as never,
          physical_form: lot.physical_form || null,
          appearance_texture: lot.appearance_texture || null,
          appearance_color: lot.appearance_color || null,
          physical_description: appearance || null,
          container_size: lot.container_size || null,
          label_content_value: labelContentNum,
          label_content_unit: lot.label_content_unit || null,
          manufacture_date: lot.manufacture_date?.trim() ? lot.manufacture_date.slice(0, 10) : null,
          client_received_date: lot.client_received_date?.trim() ? lot.client_received_date.slice(0, 10) : null,
          notes: lot.notes || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (lotErr) throw lotErr;

      // Reuse the existing solid/liquid derivation by handing it a
      // line-item-shaped view of the lot -- the fields it reads are all
      // lot-level, so nothing is lost by the three-level split.
      const derived = deriveReceivedFields({
        ...lot,
        vial_count: lot.vials.length,
        requested_tests: [],
        lot: lot.customer_lot ?? null,
        physical_description: appearance,
      } as unknown as z.infer<typeof lineItemSchema>);

      const physicalFormDetails: Record<string, string | number | null | undefined> | null = (() => {
        if (lot.physical_form === "liquid") {
          return {
            bottle_size: lot.bottle_size || null,
            liquid_volume_ml: lot.liquid_volume_ml || null,
            label_content_basis: lot.label_content_basis || null,
          };
        }
        if (lot.physical_form === "capsule") return { capsule_count: lot.capsule_count || null };
        return null;
      })();

      const methodGroupId = lot.compound_id
        ? (methodGroupByCompoundId.get(lot.compound_id) ?? null)
        : (methodGroupByCompoundName.get(lot.compound.trim().toLowerCase()) ?? null);

      const vialRows = lot.vials.map((v, vialIdx) => {
        const vialNo = vialIdx + 1;
        return {
          batch_id: vialBatchId(data.sample_id, lotNo, vialNo),
          lot_id: lotRow.id,
          vial_no: vialNo,
          assigned_test_type: v.test_type,
          client: headerClient,
          client_id: matchedClient?.id ?? null,
          project: headerProject,
          receipt_date: receiptDate,
          // parameters stays populated so existing queue/queries that read
          // it keep behaving; the authoritative per-vial test is
          // assigned_test_type above.
          parameters: [v.test_type],
          notes: v.notes || lot.notes || (lot.catalog ? `Catalog: ${lot.catalog}` : null),
          coc_id: coc.id,
          coc_line_no: vialNo,
          compound: lot.compound,
          compound_id: lot.compound_id ?? null,
          partner_reported_compound_name: lot.partner_reported_name || null,
          // The partner's per-vial lot, verbatim -- their export lookups
          // depend on it. Falls back to the lot's base customer lot for
          // vials we added that never came from them.
          lot: v.partner_lot || lot.customer_lot || null,
          catalog: lot.catalog ?? null,
          container_size: lot.container_size ?? null,
          concentration: derived.concentration,
          line_item_index: lotIdx,
          client_received_date: lot.client_received_date?.trim() ? lot.client_received_date.slice(0, 10) : null,
          manufacture_date: lot.manufacture_date?.trim() ? lot.manufacture_date.slice(0, 10) : null,
          physical_description: v.physical_description?.trim() ? v.physical_description : (appearance || null),
          appearance_texture: lot.appearance_texture || null,
          appearance_color: lot.appearance_color || null,
          created_by: userId,
          status: "received" as const,
          method_group_id: methodGroupId,
          received_form: derived.received_form,
          received_quantity: derived.received_quantity,
          received_quantity_unit: derived.received_quantity_unit,
          received_purity_percent: null,
          physical_form: lot.physical_form || null,
          label_content_value: labelContentNum,
          label_content_unit: lot.label_content_unit || null,
          is_multi_component: !!lot.is_multi_component,
          components: (lot.is_multi_component ? (lot.components ?? []) : []) as never,
          physical_form_details: physicalFormDetails as never,
        };
      });

      const { data: inserted, error: sErr } = await supabase.from("samples").insert(vialRows).select();
      if (sErr) throw sErr;
      for (const [i, row] of (inserted ?? []).entries()) {
        createdSamples.push({
          id: row.id, batch_id: row.batch_id, test_type: lot.vials[i].test_type,
          coc_id: coc.id, line_item_index: lotIdx, physical_form: row.physical_form,
        });
      }
    }

    if (data.pending_order_id) {
      await supabase
        .from("pending_orders")
        .update({
          status: "received",
          received_at: new Date().toISOString(),
          received_by: userId,
          linked_coc_id: coc.id,
        })
        .eq("id", data.pending_order_id);
    }

    await notifyNewIntake(supabase, {
      client: headerClient,
      project: headerProject,
      sampleId: data.sample_id,
      sampleCount: createdSamples.length,
      compounds: Array.from(new Set(data.lots.map((l) => l.compound).filter(Boolean))),
    });

    await syncVialPhotosForNewSamples(
      supabase,
      createdSamples.map((s) => ({ batch_id: s.batch_id, coc_id: s.coc_id, line_item_index: s.line_item_index })),
    );
    await assignStorageForNewSamples(
      supabase,
      createdSamples.map((s) => ({ id: s.id, batch_id: s.batch_id, physical_form: s.physical_form })),
    );

    return { coc, samples: createdSamples };
  });

export const submitCocWithSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sample_id: z.string().min(1).max(128),
        data: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
        ),
        line_items: z.array(lineItemSchema).min(1).max(200),
        pending_order_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const headerClient =
      (typeof data.data.client_company === "string" ? data.data.client_company : "") || "Unknown";
    const headerProject = typeof data.data.project === "string" ? data.data.project : null;
    const receiptRaw =
      (typeof data.data.date_received === "string" ? data.data.date_received : "") ||
      (typeof data.data.client_received_date === "string" ? data.data.client_received_date : "") ||
      new Date().toISOString().slice(0, 10);
    const receiptDate = receiptRaw.slice(0, 10);

    // Best-effort link to an existing client row by exact (case-insensitive)
    // company name — the CoC form's client picker normally guarantees a
    // match; a brand-new client registered in the same submission (created
    // only after this insert, see use-coc-form.ts) legitimately won't match
    // yet and is left NULL rather than guessed at.
    const { data: candidateClients } = await supabase.from("clients").select("id,company_name");
    const matchedClient =
      (candidateClients ?? []).find(
        (c) => c.company_name.trim().toLowerCase() === headerClient.trim().toLowerCase(),
      ) ?? null;

    // Link to the compound library's assigned method group. The CoC form's
    // compound picker sets compound_id directly on every line item now, so
    // this is a real id lookup, not a guess — the case-insensitive name
    // match only exists as a fallback for the rare row that somehow lacks
    // a compound_id (e.g. a very old client, or a draft resumed from before
    // the picker existed).
    const { data: candidateCompounds } = await supabase
      .from("compounds")
      .select("id,name,method_group_id");
    const methodGroupByCompoundId = new Map(
      (candidateCompounds ?? []).map((c) => [c.id as string, c.method_group_id as string | null]),
    );
    const methodGroupByCompoundName = new Map(
      (candidateCompounds ?? []).map((c) => [
        c.name.trim().toLowerCase(),
        c.method_group_id as string | null,
      ]),
    );

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
      batch_id: string;
      client: string;
      client_id: string | null;
      project: string | null;
      receipt_date: string;
      parameters: string[];
      notes: string | null;
      coc_id: string;
      coc_line_no: number;
      compound: string;
      compound_id: string | null;
      partner_reported_compound_name: string | null;
      lot: string | null;
      catalog: string | null;
      container_size: string | null;
      concentration: string | null;
      line_item_index: number;
      client_received_date: string | null;
      manufacture_date: string | null;
      physical_description: string | null;
      created_by: string;
      status: "received";
      method_group_id: string | null;
      received_form: "lyophilized" | "solution" | null;
      received_quantity: number | null;
      received_quantity_unit: string | null;
      received_purity_percent: number | null;
      physical_form: "solid" | "liquid" | "capsule" | null;
      label_content_value: number | null;
      label_content_unit: string | null;
      is_multi_component: boolean;
      components: z.infer<typeof lineItemComponentSchema>[];
      physical_form_details: Record<string, string | number | null | undefined> | null;
    };
    const rows: SampleInsert[] = [];
    let seq = 0;
    data.line_items.forEach((li, lineIdx) => {
      const vials = Math.max(1, li.vial_count ?? 1);
      const params = li.requested_tests ?? [];
      const derived = deriveReceivedFields(li);
      const labelContentNum = (() => {
        if (li.label_content_value == null || li.label_content_value === "") return null;
        const n = Number(li.label_content_value);
        return isNaN(n) ? null : n;
      })();
      const physicalFormDetails: Record<string, string | number | null | undefined> | null =
        (() => {
          if (li.physical_form === "liquid") {
            return {
              bottle_size: li.bottle_size || null,
              liquid_volume_ml: li.liquid_volume_ml || null,
              label_content_basis: li.label_content_basis || null,
            };
          }
          if (li.physical_form === "capsule") {
            return { capsule_count: li.capsule_count || null };
          }
          return null;
        })();
      for (let v = 0; v < vials; v++) {
        seq += 1;
        const sampleId = `${data.sample_id}-${String(seq).padStart(2, "0")}`;
        rows.push({
          batch_id: sampleId,
          client: headerClient,
          client_id: matchedClient?.id ?? null,
          project: headerProject,
          receipt_date: receiptDate,
          parameters: params,
          notes: li.catalog ? `Catalog: ${li.catalog}` : null,
          coc_id: coc.id,
          coc_line_no: seq,
          compound: li.compound,
          compound_id: li.compound_id ?? null,
          partner_reported_compound_name: li.partner_reported_name || null,
          lot: li.lot ?? null,
          catalog: li.catalog ?? null,
          container_size: li.container_size ?? null,
          concentration: derived.concentration,
          line_item_index: lineIdx,
          client_received_date:
            li.client_received_date && li.client_received_date.trim()
              ? li.client_received_date.slice(0, 10)
              : null,
          manufacture_date:
            li.manufacture_date && li.manufacture_date.trim()
              ? li.manufacture_date.slice(0, 10)
              : null,
          physical_description:
            li.physical_description && li.physical_description.trim()
              ? li.physical_description
              : null,
          created_by: userId,
          status: "received" as const,
          method_group_id: li.compound_id
            ? (methodGroupByCompoundId.get(li.compound_id) ?? null)
            : (methodGroupByCompoundName.get(li.compound.trim().toLowerCase()) ?? null),
          received_form: derived.received_form,
          received_quantity: derived.received_quantity,
          received_quantity_unit: derived.received_quantity_unit,
          received_purity_percent: null,
          physical_form: li.physical_form || null,
          label_content_value: labelContentNum,
          label_content_unit: li.label_content_unit || null,
          is_multi_component: !!li.is_multi_component,
          components: li.is_multi_component ? (li.components ?? []) : [],
          physical_form_details: physicalFormDetails,
        });
      }
    });
    const { data: samples, error: sErr } = await supabase.from("samples").insert(rows).select();
    if (sErr) throw sErr;
    // If this CoC was staged from a pending partner order, mark it received
    // and link it back. We keep the raw payload untouched for audit.
    if (data.pending_order_id) {
      await supabase
        .from("pending_orders")
        .update({
          status: "received",
          received_at: new Date().toISOString(),
          received_by: userId,
          linked_coc_id: coc.id,
        })
        .eq("id", data.pending_order_id);
    }

    await notifyNewIntake(supabase, {
      client: headerClient,
      project: headerProject,
      sampleId: data.sample_id,
      sampleCount: (samples ?? []).length,
      compounds: Array.from(
        new Set((samples ?? []).map((s) => s.compound as string).filter(Boolean)),
      ),
    });

    await syncVialPhotosForNewSamples(supabase, samples ?? []);
    await assignStorageForNewSamples(supabase, samples ?? []);

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
    z
      .object({
        sampleId: z.string().uuid(),
        client_id: z.string().uuid(),
        project: z.string().max(255).optional().nullable(),
        compound: z.string().min(1).max(255),
        compound_id: z.string().uuid().optional().nullable(),
        lot: z.string().max(255).optional().nullable(),
        parameters: z.array(z.string().min(1).max(128)).max(200),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("company_name")
      .eq("id", data.client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) throw new Error("Selected client not found");

    // Re-derive method_group_id in case the compound was corrected during
    // verification — same id-first-then-name pattern as intake.
    let methodGroupId: string | null = null;
    if (data.compound_id) {
      const { data: c } = await supabase
        .from("compounds")
        .select("method_group_id")
        .eq("id", data.compound_id)
        .maybeSingle();
      methodGroupId = c?.method_group_id ?? null;
    } else {
      const { data: c } = await supabase
        .from("compounds")
        .select("method_group_id")
        .ilike("name", data.compound.trim())
        .maybeSingle();
      methodGroupId = c?.method_group_id ?? null;
    }

    const { data: updated, error } = await supabase
      .from("samples")
      .update({
        client_id: data.client_id,
        client: client.company_name,
        project: data.project,
        compound: data.compound,
        compound_id: data.compound_id ?? null,
        method_group_id: methodGroupId,
        lot: data.lot,
        parameters: data.parameters,
        notes: data.notes,
        status: "prep",
      })
      .eq("id", data.sampleId)
      .select("id,batch_id,receipt_date")
      .single();
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: "intake_verified",
      table_name: "samples",
      record_id: data.sampleId,
      changed_by: userId,
      diff: { status: "prep" },
    });
    await provisionTestsForSample(supabase, updated, data.parameters, userId, updated.receipt_date);
    return { ok: true };
  });
