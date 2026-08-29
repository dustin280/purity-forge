/**
 * In-progress Sample Receipts started on OTHER machines.
 *
 * Drafts live in the browser that created them, so before this the office PC
 * had no idea the bench laptop was half-way through receiving a shipment.
 * Two people could work the same delivery and only discover it at submit.
 *
 * This lists what the lab is currently working on and where, so the answer to
 * "has anyone started SYX-000013?" is on screen. It intentionally offers no
 * Resume button for someone else's draft: the form data and its photos are on
 * that machine, and a resume here would silently start an empty second
 * receipt under the same Sample ID.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Laptop } from "lucide-react";
import { listCocDraftRegistry, type RemoteDraft } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";

/** Older than this and it's stale clutter rather than live work. */
const STALE_AFTER_HOURS = 48;

export function RemoteDraftsPanel({ localDraftIds }: { localDraftIds: string[] }) {
  const list = useServerFn(listCocDraftRegistry);
  const { data: rows = [] } = useQuery({
    queryKey: qk.cocDraftRegistry.list(),
    queryFn: () => list() as Promise<RemoteDraft[]>,
    // Someone else's draft changes without anything happening in this tab.
    refetchInterval: 60_000,
  });

  const local = new Set(localDraftIds);
  const cutoff = Date.now() - STALE_AFTER_HOURS * 3600_000;
  const elsewhere = rows.filter(
    (r) => !local.has(r.draft_id) && new Date(r.updated_at).getTime() > cutoff,
  );
  if (elsewhere.length === 0) return null;

  return (
    <Card className="mb-4 border-dashed border-amber-500/40 bg-amber-500/[0.04]">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Laptop className="size-4 text-amber-600 dark:text-amber-400" />
        <div className="text-sm font-medium">In progress elsewhere</div>
        <Badge variant="secondary" className="text-[10px]">{elsewhere.length}</Badge>
        <span className="text-xs text-muted-foreground ml-1">
          Started on another machine — check before entering the same shipment.
        </span>
      </div>
      <ul className="divide-y divide-border">
        {elsewhere.map((r) => (
          <li key={r.draft_id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {r.summary || r.sample_id || "Untitled receipt"}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.author_name ?? "Someone"}
                {r.device_label ? ` on ${r.device_label}` : ""}
                {" · "}
                {new Date(r.updated_at).toLocaleString()}
                {r.photo_count > 0 && ` · ${r.photo_count} photo${r.photo_count === 1 ? "" : "s"}`}
              </div>
            </div>
            {r.sample_id && (
              <Badge variant="outline" className="font-mono text-[10px] shrink-0">{r.sample_id}</Badge>
            )}
          </li>
        ))}
      </ul>
      <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
        Resume these on the machine they were started on — the entered data and vial photos are stored there.
      </p>
    </Card>
  );
}
