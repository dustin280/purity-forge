/**
 * Friendly re-exports of DB row types from the generated Supabase types.
 * Import these in app code instead of reaching into
 * `@/integrations/supabase/types` directly.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Sample = Tables<"samples">;
export type AuditLogRow = Tables<"audit_log">;
export type AccessLog = Tables<"access_logs">;
export type IssueReport = Tables<"issue_reports">;
export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;
export type CocField = Tables<"chain_of_custody_fields">;
export type CocRecord = Tables<"chain_of_custody_records">;
export type CocAttachment = Tables<"coc_attachments">;
export type TestParameter = Tables<"test_parameters">;