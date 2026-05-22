import { Card } from "@/components/ui/card";
import type { AccessLog } from "./types";

export function AccessLogsTable({
  rows, isLoading, error,
}: {
  rows: AccessLog[];
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr className="border-b">
              <th className="text-left font-medium px-3 py-2 w-48">Timestamp</th>
              <th className="text-left font-medium px-3 py-2">User</th>
              <th className="text-left font-medium px-3 py-2">Email</th>
              <th className="text-left font-medium px-3 py-2 w-24">Event</th>
              <th className="text-left font-medium px-3 py-2">User agent</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-destructive">{error.message}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No access events in this range.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.user_name ?? "—"}</td>
                <td className="px-3 py-2">{r.user_email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={
                    "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium " +
                    (r.event === "login"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground")
                  }>
                    {r.event}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[24rem]" title={r.user_agent ?? ""}>{r.user_agent ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}