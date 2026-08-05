import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    if (!data) return data;
    // Never round-trip the raw secret to the browser — the UI only needs to
    // know whether one is on file, and re-sends a value only to change it.
    const { password, private_key, ...rest } = data;
    return { ...rest, has_password: !!password, has_private_key: !!private_key };
  });

export const saveSftpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      host: z.string().trim().max(253),
      port: z.number().int().min(1).max(65535),
      username: z.string().trim().max(255),
      // Omitted/undefined = leave the stored secret untouched; null or "" =
      // explicitly clear it; non-empty string = replace it.
      password: z.string().max(2048).nullable().optional(),
      private_key: z.string().max(16384).nullable().optional(),
      remote_path: z.string().trim().max(1024),
      is_active: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload: Record<string, unknown> = {
      host: data.host,
      port: data.port,
      username: data.username,
      remote_path: data.remote_path,
      is_active: data.is_active,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if ("password" in data) payload.password = data.password || null;
    if ("private_key" in data) payload.private_key = data.private_key || null;

    if (data.id) {
      const { error } = await supabase.from("sftp_config").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("sftp_config").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });