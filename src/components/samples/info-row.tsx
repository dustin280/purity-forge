export function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground text-xs uppercase tracking-wider">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}