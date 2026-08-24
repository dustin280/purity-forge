/**
 * Server functions for the Issue Reports module: list reports + attachments, create new reports, update status, and presign attachment uploads. Auth-gated; RLS enforces ownership and role-based visibility.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface IssueReportRow {
  id: string;
  document_number: string;
  occurred_at: string;
  user_id: string | null;
  user_name: string;
  description: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueAttachmentRow {
  id: string;
  issue_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const listIssueReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rows, error }, { data: atts, error: aerr }] = await Promise.all([
      context.supabase
        .from("issue_reports")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      context.supabase
        .from("issue_report_attachments")
        .select("*")
        .order("uploaded_at", { ascending: false }),
    ]);
    if (error) throw error;
    if (aerr) throw aerr;
    return {
      issues: (rows ?? []) as IssueReportRow[],
      attachments: (atts ?? []) as IssueAttachmentRow[],
    };
  });

export const createIssueReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      occurred_at: z.string().min(1),
      user_name: z.string().min(1).max(255),
      description: z.string().min(1).max(8000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const rowId = crypto.randomUUID();
    const occurredDate = new Date(data.occurred_at).toISOString().slice(0, 10);
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "NCR", p_source_table: "issue_reports", p_source_id: rowId, p_date: occurredDate, p_created_by: context.userId });
    if (docErr) throw docErr;

    const { data: row, error } = await context.supabase
      .from("issue_reports")
      .insert({
        id: rowId,
        document_number: docNumber,
        occurred_at: new Date(data.occurred_at).toISOString(),
        user_name: data.user_name,
        description: data.description,
        user_id: context.userId,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as IssueReportRow;
  });

export const recordIssueAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      issue_id: z.string().uuid(),
      file_path: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(500),
      content_type: z.string().max(255).nullable().optional(),
      size_bytes: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("issue_report_attachments")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row as IssueAttachmentRow;
  });

export const signIssueAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("issue-reports")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const updateIssueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "in_progress", "resolved"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("issue_reports")
      .update({ status: data.status })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row as IssueReportRow;
  });