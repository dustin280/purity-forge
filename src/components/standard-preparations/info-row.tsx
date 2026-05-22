/**
 * Label/value pair used across the standard-preparation detail page. Renders
 * as a right-aligned single line by default, or stacked when `multiline`.
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