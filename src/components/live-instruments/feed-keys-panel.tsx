import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createInstrumentFeedKey,
  listInstrumentFeedKeys,
  revokeInstrumentFeedKey,
} from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";

function fmt(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "never";
}

/**
 * Admin panel (Admin → Instruments) for the per-instrument secrets the
 * on-prem agent signs its requests with. A new secret is shown exactly once.
 */
export function FeedKeysPanel({ instrumentId }: { instrumentId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listInstrumentFeedKeys);
  const create = useServerFn(createInstrumentFeedKey);
  const revoke = useServerFn(revokeInstrumentFeedKey);
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(null);

  const query = useQuery({
    queryKey: qk.instrumentFeed.keys(instrumentId),
    queryFn: () => list({ data: { instrument_id: instrumentId } }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({ data: { instrument_id: instrumentId, label: label.trim() || undefined } }),
    onSuccess: (r) => {
      setRevealed(r);
      setLabel("");
      qc.invalidateQueries({ queryKey: qk.instrumentFeed.keys(instrumentId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: qk.instrumentFeed.keys(instrumentId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  }

  const agentConfig = revealed
    ? JSON.stringify(
        {
          app_url: typeof window !== "undefined" ? window.location.origin : "https://syxlab.org",
          instruments: [
            { instrument_id: instrumentId, ip: "192.168.254.11", secret: revealed.secret },
          ],
        },
        null,
        2,
      )
    : null;

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4" /> Live feed keys
      </div>
      <p className="text-xs text-muted-foreground">
        The instrument agent on the OpenLab PC signs every request with one of these secrets. Create
        one per PC/agent install; revoke it to cut that agent off.
      </p>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. OpenLab PC)"
          maxLength={80}
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          <Plus className="size-4 mr-1" /> New key
        </Button>
      </div>

      {revealed && agentConfig && (
        <div className="rounded-md border border-primary/40 bg-background p-3 space-y-2">
          <div className="text-xs font-medium">
            New secret — copy it now, it will not be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs break-all flex-1">{revealed.secret}</code>
            <Button size="sm" variant="outline" onClick={() => copy(revealed.secret)}>
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Agent config (tools/agilent-tap-agent/config.json):
          </div>
          <div className="flex items-start gap-2">
            <pre className="text-[11px] leading-snug flex-1 overflow-x-auto">{agentConfig}</pre>
            <Button size="sm" variant="outline" onClick={() => copy(agentConfig)}>
              <Copy className="size-4" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="divide-y divide-border rounded-md border border-border bg-background">
        {query.isLoading && <div className="p-2 text-xs text-muted-foreground">Loading…</div>}
        {!query.isLoading && (query.data ?? []).length === 0 && (
          <div className="p-2 text-xs text-muted-foreground">No keys yet.</div>
        )}
        {(query.data ?? []).map((k) => (
          <div key={k.id} className="p-2 flex items-center gap-3 text-xs">
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {k.label} <span className="text-muted-foreground font-mono">…{k.secret_hint}</span>
                {!k.is_active && <span className="ml-2 text-destructive">revoked</span>}
              </div>
              <div className="text-muted-foreground">
                created {fmt(k.created_at)} · last seen {fmt(k.last_seen_at)}
                {k.last_agent_host ? ` from ${k.last_agent_host}` : ""}
                {k.last_agent_version ? ` (agent ${k.last_agent_version})` : ""}
              </div>
            </div>
            {k.is_active && (
              <Button
                size="icon"
                variant="ghost"
                disabled={revokeMut.isPending}
                onClick={() => {
                  if (
                    confirm(`Revoke key "${k.label}"? The agent using it will stop being accepted.`)
                  )
                    revokeMut.mutate(k.id);
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
