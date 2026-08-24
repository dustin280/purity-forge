import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { categorizePrepAlert, PREP_ALERT_CATEGORY_ORDER } from "./prep-alerts";

const ALERT_LIMIT = 20;

export const getStandardPrepAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, standard_name, lifecycle_status, expiration_date, final_volume_ml, volume_remaining_ml")
      .neq("lifecycle_status", "discarded");
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    const flagged = (data ?? [])
      .map(row => {
        const alert = categorizePrepAlert(row, today);
        return alert ? { ...alert, id: row.id, log_number: row.log_number, standard_name: row.standard_name } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => PREP_ALERT_CATEGORY_ORDER.indexOf(a.category) - PREP_ALERT_CATEGORY_ORDER.indexOf(b.category));

    return { items: flagged.slice(0, ALERT_LIMIT), total: flagged.length };
  });
