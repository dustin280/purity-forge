/**
 * Read-only dialog that loads a single CoC record by id and renders all
 * configured fields plus the per-sample line item summary. The Download PDF
 * action is delegated to the parent so the parent owns PDF generation.
 */
import React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getCocRecord } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { CocLineItemsView } from "./coc-line-items-view";
import type { CocField, CocLineItemView, CocRecord } from "./types";

export function CocViewDialog({ recordId, onOpenChange, fields, onDownload }: {
  recordId: string | null;
  onOpenChange: (v: boolean) => void;
  fields: CocField[];
  onDownload: (id: string) => void;
}) {
  const getRec = useServerFn(getCocRecord);
  const { data: rec } = useQuery({
    queryKey: qk.cocRecords.view(recordId),
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: !!recordId,
  });
  const open = !!recordId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Sample Receipt {rec ? `— ${rec.sample_id}` : ""}
          </DialogTitle>
        </DialogHeader>
        {!rec ? (
          <div className="py-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2 py-2">
            <div className="text-xs text-muted-foreground mb-3">
              Created {new Date(rec.created_at).toLocaleString()}
            </div>
            <dl className="grid sm:grid-cols-[200px_1fr] gap-x-4 gap-y-2 text-sm">
              {fields.map(f => {
                const v = rec.data?.[f.field_key];
                let display: React.ReactNode;
                if (v == null || v === "") display = "—";
                else if (Array.isArray(v)) display = v.join(", ");
                else display = String(v);
                return (
                  <div key={f.id} className="sm:contents">
                    <dt className="font-medium text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap break-words border-b border-border pb-2 sm:border-0 sm:pb-0">
                      {display}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <CocLineItemsView items={(rec as unknown as { line_items?: CocLineItemView[] }).line_items ?? []} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {rec && (
            <Button onClick={() => onDownload(rec.id)}>
              <Download className="size-4 mr-1" /> Download PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}