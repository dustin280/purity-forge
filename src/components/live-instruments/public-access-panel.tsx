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
 * unused / viewing / spent, revoke any. A code and the session it unlocks
 * both end 12 hours after the code was generated.
 */

const ANY = "__any__";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** The text an invitee gets — pasteable into an email or a social post. */
function inviteText(code: string, expiresAt: string, url: string): string {
  return [
    `You have been invited to a 12hr live chromatogram watch session, it expires at ${fmtWhen(expiresAt)}.`,
    "",
    `Watch here: ${url}`,
    `Your code: ${code}`,
  ].join("\n");
}

function codeState(r: PublicLiveCodeRow): { text: string; tone: "muted" | "ok" | "warn" } {
  const now = Date.now();
  if (r.revoked_at) return { text: "revoked", tone: "muted" };
  const ended = new Date(r.session_expires_at ?? r.code_expires_at).getTime() < now;
  if (r.redeemed_at) {
    return ended
      ? { text: "used, session ended", tone: "muted" }
      : { text: `viewing until ${fmtWhen(r.session_expires_at ?? r.code_expires_at)}`, tone: "ok" };
  }
  return ended
    ? { text: "unused, expired", tone: "muted" }
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
  const [fresh, setFresh] = useState<{ code: string; expires_at: string } | null>(null);

  const { data: codes = [] } = useQuery({
    queryKey: qk.publicLive.codes(),
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          label: label.trim() || undefined,
          instrument_id: instrumentId === ANY ? null : instrumentId,
        },
      }),
    onSuccess: (res) => {
      setFresh({ code: res.code, expires_at: res.expires_at });
      setLabel("");
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
  const invite = fresh ? inviteText(fresh.code, fresh.expires_at, shareUrl) : "";

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
          Generate a passcode and paste the invite wherever you like. The code works once and the
          watch session ends 12 hours after it was generated. Viewers see the sample name and the
          chromatogram, nothing else.
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
              className="h-9 w-[240px]"
              maxLength={80}
            />
          </div>
          {instruments.length > 1 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Instrument</div>
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="h-9 w-[220px]">
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
          <Button
            size="sm"
            className="h-9"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            <KeyRound className="size-4" />{" "}
            {createMut.isPending ? "Generating…" : "Generate passcode"}
          </Button>
        </div>

        {fresh && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-3">
            <div className="text-xs text-muted-foreground">
              Shown once — copy the invite now. The code is{" "}
              <span className="font-mono text-foreground">{fresh.code}</span>, valid until{" "}
              {fmtWhen(fresh.expires_at)}.
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
                  <th className="text-left font-medium py-1 pr-3">Created</th>
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
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtWhen(r.created_at)}</td>
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
