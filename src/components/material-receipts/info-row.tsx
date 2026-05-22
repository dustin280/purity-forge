/**
 * Small label/value row used across the material-receipts detail view.
 * Extracted so both the receipt cards and any future read-only panels can
 * share the same compact look without duplicating the markup.
 */
export function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | number | null | undefined;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? "flex flex-col gap-0.5" : "flex justify-between gap-4"}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap" : "text-right truncate"}>{value ?? "—"}</div>
    </div>
  );
}