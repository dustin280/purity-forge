export type AccessLog = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  event: string;
  user_agent: string | null;
  created_at: string;
};

export type AccessLogsSummary = { total: number; logins: number; logouts: number };