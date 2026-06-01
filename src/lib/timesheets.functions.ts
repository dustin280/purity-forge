/**
 * Server functions for the Timesheets feature.
 * - Entries are scoped per user via RLS (admins can read/edit all).
 * - Projects are an admin-managed dropdown list (read by everyone).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TimesheetEntry {
  id: string;
  user_id: string;
  user_name: string;
  entry_date: string; // YYYY-MM-DD
  project: string;
  task_description: string;
  duration_hours: number;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimesheetProject {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

const timeOrNull = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .nullable()
  .optional();

const entrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  project: z.string().min(1).max(200),
  task_description: z.string().min(1).max(2000),
  duration_hours: z.number().positive().max(24),
  start_time: timeOrNull,
  end_time: timeOrNull,
  notes: z.string().max(2000).nullable().optional(),
  user_name: z.string().min(1).max(255),
});

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  project: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  mineOnly: z.boolean().optional(),
});

export const listTimesheetEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let query = context.supabase
      .from("timesheet_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);

    if (data.mineOnly !== false) {
      query = query.eq("user_id", context.userId);
    }
    if (data.from) query = query.gte("entry_date", data.from);
    if (data.to) query = query.lte("entry_date", data.to);
    if (data.project) query = query.eq("project", data.project);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "")}%`;
      query = query.or(`task_description.ilike.${like},project.ilike.${like},notes.ilike.${like}`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []) as TimesheetEntry[];
  });

export const createTimesheetEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entrySchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("timesheet_entries")
      .insert({
        user_id: context.userId,
        user_name: data.user_name,
        entry_date: data.entry_date,
        project: data.project,
        task_description: data.task_description,
        duration_hours: data.duration_hours,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        notes: data.notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    return row as TimesheetEntry;
  });

export const updateTimesheetEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    entrySchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("timesheet_entries")
      .update({
        ...patch,
        start_time: patch.start_time || null,
        end_time: patch.end_time || null,
        notes: patch.notes || null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as TimesheetEntry;
  });

export const deleteTimesheetEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("timesheet_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Projects (admin-managed dropdown) --------

export const listTimesheetProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("timesheet_projects")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as TimesheetProject[];
  });

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const createTimesheetProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("timesheet_projects")
      .insert({
        name: data.name,
        is_active: data.is_active ?? true,
        sort_order: data.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return row as TimesheetProject;
  });

export const updateTimesheetProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    projectSchema.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("timesheet_projects")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as TimesheetProject;
  });

export const deleteTimesheetProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("timesheet_projects")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });