import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin role required");
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: samplesAll }, { data: recent }, { data: audit }, { data: results }] = await Promise.all([
      supabase.from("samples").select("status"),
      supabase.from("samples").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(15),
      supabase.from("results").select("purity_percentage"),
    ]);
    const counts = { received: 0, intake_verified: 0, prep: 0, in_progress: 0, reviewed: 0, complete: 0, approved: 0 };
    (samplesAll ?? []).forEach((s: { status: string }) => {
      if (s.status in counts) (counts as Record<string, number>)[s.status]++;
    });
    const purities = (results ?? []).map(r => Number(r.purity_percentage)).filter(n => !isNaN(n));
    const avgPurity = purities.length ? purities.reduce((a, b) => a + b, 0) / purities.length : null;
    return { samples: recent ?? [], audit: audit ?? [], counts, avgPurity };
  });

export const listSamples = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("samples").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

const sampleInput = z.object({
  batch_id: z.string().min(1).max(64),
  client: z.string().min(1).max(255),
  project: z.string().max(255).optional().nullable(),
  receipt_date: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  parameters: z.array(z.string().min(1).max(128)).max(200).optional().default([]),
});

export const createSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sampleInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: sample, error } = await supabase.from("samples").insert({
      ...data, created_by: userId,
    }).select().single();
    if (error) throw error;
    // auto-create default test
    await supabase.from("tests").insert({
      sample_id: sample.id, method_name: "Peptide Purity HPLC-DAD",
      instrument: "Agilent 1290 DAD", assigned_tech: userId,
    });
    return sample;
  });

export const getSampleDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: sample, error } = await supabase.from("samples").select("*").eq("batch_id", data.batchId).maybeSingle();
    if (error) throw error;
    if (!sample) throw new Error("Sample not found");
    const { data: tests } = await supabase.from("tests").select("*").eq("sample_id", sample.id);
    const testIds = (tests ?? []).map(t => t.id);
    const results = testIds.length
      ? (await supabase.from("results").select("*").in("test_id", testIds)).data ?? []
      : [];
    return { sample, tests: tests ?? [], results };
  });

export const updateSampleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      status: z.enum(["received", "intake_verified", "prep", "in_progress", "reviewed", "complete", "approved"]),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("samples").update({ status: data.status }).eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: `status_change:${data.status}`, table_name: "samples",
      record_id: data.sampleId, changed_by: userId,
      diff: { status: data.status },
    });
    return { ok: true };
  });

const peakSchema = z.object({
  peak_id: z.string(), rt: z.number(), area: z.number(),
  area_pct: z.number(), identity: z.string().optional(), sn: z.number().optional(),
});

export const saveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      testId: z.string().uuid(),
      purity_percentage: z.number().min(0).max(100),
      peaks: z.array(peakSchema).max(200),
      raw_data_file_path: z.string().max(1000).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.from("results").insert({
      test_id: data.testId,
      purity_percentage: data.purity_percentage,
      peak_details: data.peaks,
      raw_data_file_path: data.raw_data_file_path ?? null,
      analyst_id: userId,
    }).select().single();
    if (error) throw error;
    return res;
  });

export const getExportConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("export_config").select("*").limit(1).maybeSingle();
    return data;
  });

export const saveExportConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      webhook_url: z.string().url().or(z.literal("")).nullable().optional(),
      include_lcs: z.boolean(),
      include_ccv: z.boolean(),
      include_method_blank: z.boolean(),
      include_calibration: z.boolean(),
      is_active: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = { ...data, updated_by: userId, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await supabase.from("export_config").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("export_config").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const getSftpConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("sftp_config").select("*").limit(1).maybeSingle();
    return data;
  });

export const saveSftpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      host: z.string().trim().max(253),
      port: z.number().int().min(1).max(65535),
      username: z.string().trim().max(255),
      password: z.string().max(2048).nullable().optional(),
      private_key: z.string().max(16384).nullable().optional(),
      remote_path: z.string().trim().max(1024),
      is_active: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password || null,
      private_key: data.private_key || null,
      remote_path: data.remote_path,
      is_active: data.is_active,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("sftp_config").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("sftp_config").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profiles } = await context.supabase.from("profiles").select("*");
    const { data: roles } = await context.supabase.from("user_roles").select("*");
    return { profiles: profiles ?? [], roles: roles ?? [] };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "tech", "reviewer"]),
      grant: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.grant) {
      const { error } = await supabase.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email().max(255),
      first_name: z.string().min(1).max(128).trim(),
      last_name: z.string().min(1).max(128).trim(),
      title: z.string().max(128).trim().optional().nullable(),
      password: z.string().min(8).max(128),
      roles: z.array(z.enum(["admin", "tech", "reviewer"])).max(3).default([]),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name,
        first_name: data.first_name,
        last_name: data.last_name,
        title: data.title ?? null,
      },
    });
    if (error) throw error;
    const newId = created.user?.id;
    if (!newId) throw new Error("User creation failed");
    // Ensure profile reflects the latest fields (in case trigger ran with partial metadata).
    await supabaseAdmin.from("profiles").update({
      full_name,
      first_name: data.first_name,
      last_name: data.last_name,
      title: data.title ?? null,
    } as never).eq("id", newId);
    // handle_new_user trigger creates profile + default 'tech' role.
    // Replace with the exact roles requested.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    if (data.roles.length) {
      const rows = data.roles.map(r => ({ user_id: newId, role: r }));
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (rErr) throw rErr;
    }
    return { ok: true, id: newId };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(8).max(128),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    return { ok: true };
  });

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      first_name: z.string().min(1).max(128).trim(),
      last_name: z.string().min(1).max(128).trim(),
      email: z.string().email().max(255),
      title: z.string().max(128).trim().optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      user_metadata: {
        full_name,
        first_name: data.first_name,
        last_name: data.last_name,
        title: data.title ?? null,
      },
    });
    if (aErr) throw aErr;
    const { error: pErr } = await supabaseAdmin.from("profiles").update({
      email: data.email,
      full_name,
      first_name: data.first_name,
      last_name: data.last_name,
      title: data.title ?? null,
    } as never).eq("id", data.userId);
    if (pErr) throw pErr;
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email().max(255),
      first_name: z.string().min(1).max(128).trim(),
      last_name: z.string().min(1).max(128).trim(),
      title: z.string().max(128).trim().optional().nullable(),
      roles: z.array(z.enum(["admin", "tech", "reviewer"])).max(3).default([]),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const redirectTo =
      (process.env.SITE_URL as string | undefined) ??
      (process.env.PUBLIC_SITE_URL as string | undefined) ??
      undefined;
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: {
        full_name,
        first_name: data.first_name,
        last_name: data.last_name,
        title: data.title ?? null,
      },
      redirectTo,
    });
    if (error) throw error;
    const newId = invited.user?.id;
    if (!newId) throw new Error("Invite failed");
    await supabaseAdmin.from("profiles").update({
      full_name,
      first_name: data.first_name,
      last_name: data.last_name,
      title: data.title ?? null,
    } as never).eq("id", newId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    if (data.roles.length) {
      const rows = data.roles.map(r => ({ user_id: newId, role: r }));
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (rErr) throw rErr;
    }
    return { ok: true, id: newId };
  });

export const listParameters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("test_parameters").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(128).trim() }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("test_parameters")
      .insert({ name: data.name, created_by: userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(128).trim().optional(),
      is_active: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("test_parameters").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("test_parameters").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============= Chain of Custody =============

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
      .like("sample_id", `${prefix}%`);
    if (error) throw error;
    let max = 99;
    for (const r of data ?? []) {
      const tail = String((r as { sample_id: string }).sample_id).slice(prefix.length);
      const n = parseInt(tail, 10);
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
  requested_tests: z.array(z.string().min(1).max(128)).max(200).optional().default([]),
});

export const submitCocWithSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().min(1).max(128), // CoC invoice #
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

    // 1. Insert the CoC record (with line_items embedded)
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

    // 2. Create one sample per vial across all line items (continuous numbering)
    type SampleInsert = {
      batch_id: string; client: string; project: string | null;
      receipt_date: string; parameters: string[]; notes: string | null;
      coc_id: string; coc_line_no: number; compound: string;
      lot: string | null; catalog: string | null;
      container_size: string | null; concentration: string | null;
      temperature_c: number | null; line_item_index: number;
      created_by: string; status: "received";
    };
    const rows: SampleInsert[] = [];
    let seq = 0;
    data.line_items.forEach((li, lineIdx) => {
      const vials = Math.max(1, li.vial_count ?? 1);
      // Each sample's tests come ONLY from its own line item — no header fallback.
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
    // auto-create default test if missing
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
