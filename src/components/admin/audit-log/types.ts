export type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  changed_by: string | null;
  changed_at: string;
  diff: any;
};

export type ProfileLite = { id: string; full_name: string | null; email: string | null };