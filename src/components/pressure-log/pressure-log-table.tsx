import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { InstrumentPressureLogRow } from "@/lib/instrument-feed.functions";

function num(v: number | null, decimals: number): string {
  return v == null ? "—" : v.toFixed(decimals);
}

export function PressureLogTable({
  rows,
  instrumentNames,
  showInstrument,
  showColumn = false,
  forPrint = false,
}: {
  rows: InstrumentPressureLogRow[];
  instrumentNames: Map<string, string>;
  showInstrument: boolean;
  showColumn?: boolean;
  /** plain text only (no links or badges) for the printed copy */
  forPrint?: boolean;
}) {
  const th = "text-left font-medium px-4 py-2";
  const thR = "text-right font-medium px-4 py-2";
  const td = "px-4 py-1.5 whitespace-nowrap";
  const tdR = "px-4 py-1.5 text-right font-mono whitespace-nowrap";
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className={th}>Time</th>
          {showInstrument && <th className={th}>Instrument</th>}
          {showColumn && <th className={th}>Column</th>}
          <th className={th}>State</th>
          <th className={thR}>Pressure (bar)</th>
          <th className={thR}>Min</th>
          <th className={thR}>Max</th>
          <th className={thR}>Flow (mL/min)</th>
          <th className={thR}>Col. Temp (°C)</th>
          <th className={thR}>Samples</th>
          {!forPrint && <th className={th}>Run</th>}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={td}>{format(new Date(r.logged_at), "MMM d, yyyy HH:mm")}</td>
            {showInstrument && (
              <td className={td}>{instrumentNames.get(r.instrument_id) ?? r.instrument_id}</td>
            )}
            {showColumn && (
              <td className={`${td} max-w-[16rem] truncate`} title={r.column_name ?? undefined}>
                {r.column_name ?? <span className="text-muted-foreground">—</span>}
              </td>
            )}
            <td className={td}>
              {forPrint ? (
                <span className="capitalize">{r.state}</span>
              ) : (
                <Badge
                  variant={r.state === "running" ? "default" : "secondary"}
                  className="font-sans capitalize"
                >
                  {r.state}
                </Badge>
              )}
            </td>
            <td className={tdR}>{num(r.pressure_bar, 1)}</td>
            <td className={`${tdR} text-muted-foreground`}>{num(r.pressure_min_bar, 1)}</td>
            <td className={`${tdR} text-muted-foreground`}>{num(r.pressure_max_bar, 1)}</td>
            <td className={tdR}>{num(r.flow_ml_min, 3)}</td>
            <td className={tdR}>{num(r.column_temp_c, 1)}</td>
            <td className={`${tdR} text-muted-foreground`}>{r.samples}</td>
            {!forPrint && (
              <td className={td}>
                {r.run_id ? (
                  <Link
                    to="/lab-logs/live-instruments/$runId"
                    params={{ runId: r.run_id }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Replay
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
