/**
 * Clients directory: CRUD for the `clients` table and its `client_contacts`
 * children. Used by the Clients admin page and by the Chain of Custody form
 * (search/autopopulate and "register new client on submit").
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ClientContactRow {
  id: string;
  client_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  company_name: string;
  address: string | null;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWithContacts extends ClientRow {
  contacts: ClientContactRow[];
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(255).email().or(z.literal("")).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
});

const clientBaseSchema = z.object({
  company_name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(1000).nullable().optional(),
  primary_contact_name: z.string().trim().max(200).nullable().optional(),
  primary_contact_title: z.string().trim().max(200).nullable().optional(),
  primary_contact_email: z.string().trim().max(255).email().or(z.literal("")).nullable().optional(),
  primary_contact_phone: z.string().trim().max(50).nullable().optional(),
  contacts: z.array(contactSchema).max(10).optional(),
});

function emptyToNull<T extends string | null | undefined>(v: T): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().max(200).optional(), include_inactive: z.boolean().optional() })
      .optional()
      .parse(d) ?? {},
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("clients").select("*").order("company_name", { ascending: true });
    if (!data?.include_inactive) q = q.eq("is_active", true);
    if (data?.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(
        `company_name.ilike.${s},primary_contact_name.ilike.${s},primary_contact_email.ilike.${s}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as ClientRow[];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: client, error } = await context.supabase
      .from("clients").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: contacts, error: cErr } = await context.supabase
      .from("client_contacts").select("*")
      .eq("client_id", data.id)
      .order("sort_order", { ascending: true });
    if (cErr) throw cErr;
    return { ...(client as ClientRow), contacts: (contacts ?? []) as ClientContactRow[] };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientBaseSchema.parse(d))
  .handler(async ({ context, data }) => {
    const companyName = data.company_name.trim();
    // Idempotent on company_name
    const { data: existing } = await context.supabase
      .from("clients").select("*").eq("company_name", companyName).maybeSingle();
    if (existing) return existing as ClientRow;

    const { data: row, error } = await context.supabase
      .from("clients")
      .insert({
        company_name: companyName,
        address: emptyToNull(data.address),
        primary_contact_name: emptyToNull(data.primary_contact_name),
        primary_contact_title: emptyToNull(data.primary_contact_title),
        primary_contact_email: emptyToNull(data.primary_contact_email),
        primary_contact_phone: emptyToNull(data.primary_contact_phone),
        created_by: context.userId,
      })
      .select().single();
    if (error) throw error;

    if (data.contacts && data.contacts.length > 0) {
      const rows = data.contacts.map((c, idx) => ({
        client_id: (row as ClientRow).id,
        name: c.name.trim(),
        title: emptyToNull(c.title),
        email: emptyToNull(c.email),
        phone: emptyToNull(c.phone),
        sort_order: idx,
      }));
      const { error: cErr } = await context.supabase.from("client_contacts").insert(rows);
      if (cErr) throw cErr;
    }
    return row as ClientRow;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    clientBaseSchema.extend({
      id: z.string().uuid(),
      is_active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, contacts, ...patch } = data;
    const { error } = await context.supabase
      .from("clients")
      .update({
        company_name: patch.company_name.trim(),
        address: emptyToNull(patch.address),
        primary_contact_name: emptyToNull(patch.primary_contact_name),
        primary_contact_title: emptyToNull(patch.primary_contact_title),
        primary_contact_email: emptyToNull(patch.primary_contact_email),
        primary_contact_phone: emptyToNull(patch.primary_contact_phone),
        ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
      })
      .eq("id", id);
    if (error) throw error;

    if (contacts) {
      // Replace strategy: delete all then insert
      const { error: delErr } = await context.supabase
        .from("client_contacts").delete().eq("client_id", id);
      if (delErr) throw delErr;
      if (contacts.length > 0) {
        const rows = contacts.map((c, idx) => ({
          client_id: id,
          name: c.name.trim(),
          title: emptyToNull(c.title),
          email: emptyToNull(c.email),
          phone: emptyToNull(c.phone),
          sort_order: idx,
        }));
        const { error: insErr } = await context.supabase.from("client_contacts").insert(rows);
        if (insErr) throw insErr;
      }
    }
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });