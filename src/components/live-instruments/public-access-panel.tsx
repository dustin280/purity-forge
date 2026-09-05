import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPublicLiveCode,
  listPublicLiveCodes,
  revokePublicLiveCode,
  type PublicLiveCodeRow,
} from "@/lib/public-live.functions";
import { qk } from "@/lib/query-keys";

/**
 * Admin card on the Live Instruments page: mint one-time passcodes for the
 * public /live viewer, hand out a ready-to-paste invite, see which codes are
 * unused / viewing / spent, revoke any. A watch session is a window chosen
 * here — a start (default now) and a length in hours (default 12) — and the
 * code and the viewing both end when that window does.
 */

const ANY = "__any__";
const DEFAULT_HOURS = 12;
const MAX_HOURS = 24 * 7;

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** `datetime-local` value (local time, no zone) for `t` — for the input's min. */
function toLocalInput(t: number): string {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

interface FreshCode {
  code: string;
  starts_at: string;
  expires_at: string;
  hours: number;
}

/** The text an invitee gets — pasteable into an email or a social post. */
function inviteText(fresh: FreshCode, url: string): string {
  const scheduled = new Date(fresh.starts_at).getTime() > Date.now() + 60_000;
  const when = scheduled
    ? `it goes live at ${fmtWhen(fresh.starts_at)} and expires at ${fmtWhen(fresh.expires_at)}`
    : `it expires at ${fmtWhen(fresh.expires_at)}`;
  return [
    `You have been invited to a ${fresh.hours}hr live chromatogram watch session, ${when}.`,
    "",
    `Watch here: ${url}`,
    `Your code: ${fresh.code}`,
  ].join("\n");
}

function codeState(r: PublicLiveCodeRow): { text: string; tone: "muted" | "ok" | "warn" } {
  const now = Date.now();
  if (r.revoked_at) return { text: "revoked", tone: "muted" };
  const end = r.session_expires_at ?? r.code_expires_at;
  const ended = new Date(end).getTime() < now;
  const pending = new Date(r.starts_at).getTime() > now;
  if (r.redeemed_at) {
    if (ended) return { text: "used, session ended", tone: "muted" };
    return pending
      ? { text: `redeemed, goes live ${fmtWhen(r.starts_at)}`, tone: "ok" }
      : { text: `viewing until ${fmtWhen(end)}`, tone: "ok" };
  }
  if (ended) return { text: "unused, expired", tone: "muted" };
  return pending
    ? { text: `unused, goes live ${fmtWhen(r.starts_at)}`, tone: "warn" }
    : { text: `unused, expires ${fmtWhen(r.code_expires_at)}`, tone: "warn" };
}

export function PublicAccessPanel({
  instruments,
}: {
  instruments: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPublicLiveCodes);
  const createFn = useServerFn(createPublicLiveCode);
  const revokeFn = useServerFn(revokePublicLiveCode);
  const [label, setLabel] = useState("");
  const [instrumentId, setInstrumentId] = useState(ANY);
  const [hours, setHours] = useState(String(DEFAULT_HOURS));
  /** `datetime-local` value; empty = goes live now */
  const [startsAt, setStartsAt] = useState("");
  const [fresh, setFresh] = useState<FreshCode | null>(null);

  const { data: codes = [] } = useQuery({
    queryKey: qk.publicLive.codes(),
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const hoursNum = Math.round(Number(hours));
  const hoursValid = Number.isFinite(hoursNum) && hoursNum >= 1 && hoursNum <= MAX_HOURS;
  const startMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const startValid = !startsAt || !Number.isNaN(startMs);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          label: label.trim() || undefined,
          instrument_id: instrumentId === ANY ? null : instrumentId,
          hours: hoursNum,
          starts_at: startsAt && !Number.isNaN(startMs) ? new Date(startMs).toISOString() : null,
        },
      }),
    onSuccess: (res) => {
      setFresh({
        code: res.code,
        starts_at: res.starts_at,
        expires_at: res.expires_at,
        hours: res.hours,
      });
      setLabel("");
      setStartsAt("");
      qc.invalidateQueries({ queryKey: qk.publicLive.codes() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Revoked");
      qc.invalidateQueries({ queryKey: qk.publicLive.codes() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/live` : "/live";
  const invite = fresh ? inviteText(fresh, shareUrl) : "";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Copy failed — select the text and copy it by hand");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="size-4" /> Public viewer passcodes
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Generate a passcode and paste the invite wherever you like. Pick how long the watch
          session runs and when it goes live (now, unless you set a time); the code works once and
          everything ends when the session does. Viewers see the sample name and the chromatogram,
          nothing else.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Who is it for (optional)</div>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Client visit — Dr. Lee"
              className="h-9 w-[220px]"
              maxLength={80}
            />
          </div>
          {instruments.length > 1 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Instrument</div>
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any instrument</SelectItem>
                  {instruments.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Length (hours)</div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_HOURS}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="h-9 w-[100px]"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Goes live (blank = now)</div>
            <div className="flex items-center gap-1">
              <Input
                type="datetime-local"
                value={startsAt}
                min={toLocalInput(Date.now())}
                onChange={(e) => setStartsAt(e.target.value)}
                className="h-9 w-[210px]"
              />
              {startsAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2"
                  onClick={() => setStartsAt("")}
                >
                  Now
                </Button>
              )}
            </div>
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={createMut.isPending || !hoursValid || !startValid}
            onClick={() => createMut.mutate()}
          >
            <KeyRound className="size-4" />{" "}
            {createMut.isPending ? "Generating…" : "Generate passcode"}
          </Button>
        </div>
        {!hoursValid && (
          <div className="text-xs text-destructive">
            Length must be between 1 and {MAX_HOURS} hours.
          </div>
        )}

        {fresh && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-3">
            <div className="text-xs text-muted-foreground">
              Shown once — copy the invite now. The code is{" "}
              <span className="font-mono text-foreground">{fresh.code}</span>; the session runs{" "}
              {fmtWhen(fresh.starts_at)} to {fmtWhen(fresh.expires_at)}.
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed font-sans select-all">
              {invite}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => copy(invite, "Invite")}>
                <Copy className="size-3.5" /> Copy invite
              </Button>
              <Button variant="outline" size="sm" onClick={() => copy(fresh.code, "Code")}>
                <Copy className="size-3.5" /> Copy code only
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {codes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium py-1 pr-3">Label</th>
                  <th className="text-left font-medium py-1 pr-3">Code</th>
                  <th className="text-left font-medium py-1 pr-3">Instrument</th>
                  <th className="text-left font-medium py-1 pr-3">Session</th>
                  <th className="text-left font-medium py-1 pr-3">Status</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {codes.map((r) => {
                  const st = codeState(r);
                  const active = !r.revoked_at && st.tone !== "muted";
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 pr-3">
                        {r.label ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">····-{r.code_hint}</td>
                      <td className="py-1.5 pr-3">
                        {r.instrument_id
                          ? (instruments.find((i) => i.id === r.instrument_id)?.name ??
                            "one instrument")
                          : "any"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {fmtWhen(r.starts_at)} to {fmtWhen(r.code_expires_at)}
                      </td>
                      <td
                        className={
                          "py-1.5 pr-3 " +
                          (st.tone === "ok"
                            ? "text-[var(--status-success,oklch(0.65_0.15_150))]"
                            : st.tone === "warn"
                              ? "text-foreground"
                              : "text-muted-foreground")
                        }
                      >
                        {st.text}
                      </td>
                      <td className="py-1.5 text-right">
                        {active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive"
                            disabled={revokeMut.isPending}
                            onClick={() => revokeMut.mutate(r.id)}
                          >
                            <ShieldOff className="size-3.5" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
