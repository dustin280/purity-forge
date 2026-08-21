/**
 * Shared categorization for the Standard Prep expiry/low-volume watcher
 * (Track A4). Pure function, imported by both the dashboard alert query
 * (server) and the log-list badge (client) so the two surfaces can't drift
 * on thresholds.
 */
export const PREP_ALERT_EXPIRY_WINDOW_DAYS = 3;
export const PREP_ALERT_LOW_VOLUME_PCT = 0.2;

export type PrepAlertCategory = "expired" | "depleted" | "expiring_soon" | "low_volume";

export const PREP_ALERT_CATEGORY_ORDER: PrepAlertCategory[] = [
  "expired", "depleted", "expiring_soon", "low_volume",
];

export interface PrepAlert {
  category: PrepAlertCategory;
  label: string;
  detail: string;
  className: string;
}

interface AlertableRow {
  lifecycle_status: string;
  expiration_date: string | null;
  final_volume_ml: number | null;
  volume_remaining_ml: number | null;
}

const CATEGORY_STYLE: Record<PrepAlertCategory, string> = {
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  depleted: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  expiring_soon: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low_volume: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T00:00:00Z").getTime();
  const to = new Date(toISO + "T00:00:00Z").getTime();
  return Math.round((to - from) / 86400000);
}

export function categorizePrepAlert(row: AlertableRow, todayISO: string): PrepAlert | null {
  if (row.lifecycle_status === "discarded") return null;

  if (row.expiration_date && row.expiration_date < todayISO) {
    const daysAgo = daysBetween(row.expiration_date, todayISO);
    return {
      category: "expired",
      label: "Expired",
      detail: daysAgo === 0 ? "Expired today" : `Expired ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`,
      className: CATEGORY_STYLE.expired,
    };
  }

  if (row.lifecycle_status === "depleted") {
    return { category: "depleted", label: "Depleted", detail: "0 mL remaining", className: CATEGORY_STYLE.depleted };
  }

  if (row.expiration_date) {
    const daysUntil = daysBetween(todayISO, row.expiration_date);
    if (daysUntil >= 0 && daysUntil <= PREP_ALERT_EXPIRY_WINDOW_DAYS) {
      return {
        category: "expiring_soon",
        label: "Expiring soon",
        detail: daysUntil === 0 ? "Expires today" : `Expires in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
        className: CATEGORY_STYLE.expiring_soon,
      };
    }
  }

  if (row.final_volume_ml != null && row.volume_remaining_ml != null && row.final_volume_ml > 0) {
    const pct = row.volume_remaining_ml / row.final_volume_ml;
    if (pct <= PREP_ALERT_LOW_VOLUME_PCT) {
      return {
        category: "low_volume",
        label: "Low volume",
        detail: `${Math.round(pct * 100)}% remaining`,
        className: CATEGORY_STYLE.low_volume,
      };
    }
  }

  return null;
}
