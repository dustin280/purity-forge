import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./shared.server";

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