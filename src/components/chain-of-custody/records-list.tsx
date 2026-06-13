/**
 * Records table for the Chain of Custody page. Renders the per-record row
 * with select checkbox, view/PDF/edit/delete actions, and the bulk-select
 * toolbar above. Parent owns the data fetch and all action callbacks.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Pencil, Trash2, Eye, Download } from "lucide-react";
import type { CocRecord } from "./types";

export function RecordsList({
  records, isLoading, isAdmin,
  selected, onToggleOne, onToggleAll,
  downloading, onDownloadSelected,
  onView, onDownloadOne, onEdit, onDelete,
}: {
  records: CocRecord[];
  isLoading: boolean;
  isAdmin: boolean;
  selected: Set<string>;
  onToggleOne: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  downloading: boolean;
  onDownloadSelected: () => void;
  onView: (id: string) => void;
  onDownloadOne: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (r: CocRecord) => void;
}) {
  const allChecked = records.length > 0 && selected.size === records.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <>
      {records.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => onToggleAll(v === true)}
            aria-label="Select all"
          />
          <span>
            {selected.size > 0 ? `${selected.size} selected` : `Select records to download`}
          </span>
          <div className="flex-1" />
          <Button
            size="sm" variant="outline"
            disabled={selected.size === 0 || downloading}
            onClick={onDownloadSelected}
          >
            <Download className="size-3.5 mr-1" />
            {downloading ? "Preparing…" : selected.size > 1 ? `Download ${selected.size} as ZIP` : "Download PDF"}
          </Button>
        </div>
      )}

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 mx-auto mb-2 opacity-40" />
            No sample receipt records yet. Click <span className="font-medium">New Sample Receipt</span> to create one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {records.map(r => {
              const product = (r.data?.product_name as string) || "";
              const client = (r.data?.client_company as string) || "";
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) => onToggleOne(r.id, v === true)}
                    aria-label={`Select ${r.sample_id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.sample_id}{product ? ` — ${product}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {client || "—"} · {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onView(r.id)}>
                    <Eye className="size-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDownloadOne(r.id)}>
                    <Download className="size-3.5 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEdit(r.id)}>
                    <Pencil className="size-3.5 mr-1" /> Edit
                  </Button>
                  {isAdmin && (
                    <Button size="icon" variant="ghost"
                      onClick={() => onDelete(r)}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}