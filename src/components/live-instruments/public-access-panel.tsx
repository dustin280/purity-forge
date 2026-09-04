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
 * public /live viewer, see which are unused / active / spent, revoke any.
 */

const ANY = "__any__";

function codeState(r: PublicLiveCodeRow): { text: string; tone: "muted" | "ok" | "warn" } {
  const now = Date.now();
  if (r.revoked_at) return { text: "revoked", tone: "muted" };
  if (r.redeemed_at) {
    if (r.session_expires_at && new Date(r.session_expires_at).getTime() > now)
      return {
        text: `viewing until ${new Date(r.session_expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
        tone: "ok",
      };
    return { text: "used, access ended", tone: "muted" };
  }
  if (new Date(r.code_expires_at).getTime() < now) return { text: "unused, lapsed", tone: "muted" };
  return {
    text: `unused, valid until ${new Date(r.code_expires_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
    tone: "warn",
  };
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
  const [fresh, setFresh] = useState<{
    code: string;
    code_expires_at: string;
    session_hours: number;
  } | null>(null);

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
      setFresh(res);
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
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
          Give someone a passcode and the link <span className="font-mono">{shareUrl}</span>. It
          works once, within 24 hours, and then opens the live feed on their device for 12 hours.
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
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              New passcode — shown once. Valid to redeem until{" "}
              {new Date(fresh.code_expires_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              , then {fresh.session_hours} hours of viewing.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl tracking-[0.2em]">{fresh.code}</span>
              <Button variant="outline" size="sm" onClick={() => copy(fresh.code)}>
                <Copy className="size-3.5" /> Copy code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copy(
                    `Live instrument feed: ${shareUrl}\nPasscode: ${fresh.code} (works once, 12 hours of access)`,
                  )
                }
              >
                <Copy className="size-3.5" /> Copy message
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
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
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
