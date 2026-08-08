/**
 * Helpers for HTML date / datetime-local inputs.
 *
 * `<input type="datetime-local">` only accepts `YYYY-MM-DDTHH:MM`. Anything
 * else (an ISO timestamp with seconds/zone, a `MM/DD/YYYY` string, etc.) is
 * silently dropped by the browser and the field renders blank or half-filled.
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Current local time formatted for a datetime-local input. */
export function nowDatetimeInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize an arbitrary stored value to `YYYY-MM-DDTHH:MM` ("" if unparseable). */
export function toLocalDatetimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (!v) return "";
  // Already in the right shape (optionally with seconds) — keep the literal
  // wall-clock value so we never shift it by a timezone offset.
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v);
  if (m) return `${m[1]}T${m[2]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize an arbitrary stored value to `YYYY-MM-DD` ("" if unparseable). */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (m) return m[1];
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
