import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getSolventAlertSettings,
  sendSolventTestAlert,
  setRecipientSolventAlert,
  updateSolventAlertThreshold,
} from "@/lib/instrument-solvents.functions";
import { qk } from "@/lib/query-keys";

/**
 * Admin card on the Live Instruments page: the low-solvent threshold for the
 * selected instrument, which notification recipients get the email / text,
 * a test send, and the recent alerts with when they cleared.
 */

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SolventAlertsPanel({ instrumentId }: { instrumentId: string | null }) {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getSolventAlertSettings);
  const thresholdFn = useServerFn(updateSolventAlertThreshold);
  const recipientFn = useServerFn(setRecipientSolventAlert);
  const testFn = useServerFn(sendSolventTestAlert);
  const { data: settings } = useQuery({
    queryKey: qk.solventAlerts.settings(instrumentId),
    queryFn: () => settingsFn({ data: { instrument_id: instrumentId ?? "" } }),
    enabled: !!instrumentId,
    refetchInterval: 30_000,
  });
  const [threshold, setThreshold] = useState("");
  useEffect(() => {
    if (settings) setThreshold(String(settings.threshold_pct));
  }, [settings]);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.solventAlerts.settings(instrumentId) });

  const thresholdMut = useMutation({
    mutationFn: (pct: number) =>
      thresholdFn({ data: { instrument_id: instrumentId ?? "", threshold_pct: pct } }),
    onSuccess: () => {
      toast.success("Threshold saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recipientMut = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => recipientFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const testMut = useMutation({
    mutationFn: () => testFn({ data: { instrument_id: instrumentId ?? "" } }),
    onSuccess: (r) => {
      const sent = `${r.emails} email${r.emails === 1 ? "" : "s"}, ${r.sms} text${r.sms === 1 ? "" : "s"}`;
      if (r.failures.length) toast.error(`Test sent: ${sent}. Failed: ${r.failures.join("; ")}`);
      else if (r.emails + r.sms === 0) toast.warning("Nobody is subscribed yet.");
      else toast.success(`Test sent: ${sent}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pct = Math.round(Number(threshold));
  const pctValid = Number.isFinite(pct) && pct >= 1 && pct <= 90;
  const subscribed = (settings?.recipients ?? []).filter((r) => r.is_active && r.alert_solvent_low);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BellRing className="size-4" /> Low-solvent alerts
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          When a bottle on this instrument drops below the threshold, subscribed recipients get an
          email and a text. The alert clears by itself once the bottle is refilled past the
          threshold plus {settings?.clear_margin_pct ?? 5}%, and can fire again after that.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Alert when below (% of bottle)</div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="h-9 w-[110px]"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={!pctValid || thresholdMut.isPending || pct === settings?.threshold_pct}
            onClick={() => thresholdMut.mutate(pct)}
          >
            Save threshold
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={testMut.isPending || !instrumentId}
            onClick={() => testMut.mutate()}
            title="Sends a clearly marked test to everyone subscribed"
          >
            <Send className="size-3.5" /> {testMut.isPending ? "Sending…" : "Send test alert"}
          </Button>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div className="text-xs font-medium">
              Recipients{" "}
              <span className="text-muted-foreground font-normal">
                ({subscribed.length} subscribed)
              </span>
            </div>
            <Link to="/admin/notifications" className="text-xs underline text-muted-foreground">
              Manage recipients
            </Link>
          </div>
          {(settings?.recipients ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No notification recipients yet. Add people under Admin → Notifications.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium py-1 pr-3">Low solvent</th>
                    <th className="text-left font-medium py-1 pr-3">Name</th>
                    <th className="text-left font-medium py-1 pr-3">Email</th>
                    <th className="text-left font-medium py-1 pr-3">Text</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(settings?.recipients ?? []).map((r) => (
                    <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                      <td className="py-1.5 pr-3">
                        <input
                          type="checkbox"
                          className="size-4 align-middle accent-[var(--primary)]"
                          checked={r.alert_solvent_low}
                          disabled={recipientMut.isPending || !r.is_active}
                          onChange={(e) => recipientMut.mutate({ id: r.id, on: e.target.checked })}
                          aria-label={`Low-solvent alerts for ${r.name}`}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        {r.name}
                        {!r.is_active && (
                          <span className="ml-1 text-muted-foreground">(inactive)</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {r.notify_email && r.email ? r.email : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {r.notify_sms && r.phone ? r.phone : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-medium mb-1">Recent alerts</div>
          {(settings?.alerts ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">None so far.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium py-1 pr-3">Bottle</th>
                    <th className="text-left font-medium py-1 pr-3">Level</th>
                    <th className="text-left font-medium py-1 pr-3">Triggered</th>
                    <th className="text-left font-medium py-1 pr-3">Sent</th>
                    <th className="text-left font-medium py-1 pr-3">Cleared</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(settings?.alerts ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="py-1.5 pr-3 font-medium">{a.bottle_name}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {a.pct.toFixed(0)}%
                        {a.remaining_ml != null && a.capacity_ml != null
                          ? ` (${a.remaining_ml.toFixed(0)} of ${a.capacity_ml.toFixed(0)} mL)`
                          : ""}{" "}
                        <span className="text-muted-foreground">below {a.threshold_pct}%</span>
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtWhen(a.triggered_at)}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {a.notify_result
                          ? `${a.notify_result.emails} email, ${a.notify_result.sms} text` +
                            (a.notify_result.failures.length
                              ? `, ${a.notify_result.failures.length} failed`
                              : "")
                          : a.notified_at
                            ? "sent"
                            : "—"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {a.cleared_at
                          ? `${fmtWhen(a.cleared_at)}${a.cleared_pct != null ? ` at ${a.cleared_pct.toFixed(0)}%` : ""}`
                          : "open"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
