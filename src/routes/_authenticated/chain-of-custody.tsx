/**
 * Chain of Custody listing route. Shows the table of submitted CoC records,
 * a live "drafts in progress" panel sourced from localStorage, and entry
 * points to create / view / edit individual records. All form, view, and
 * line-item UI lives in `@/components/chain-of-custody/*`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listCocFields, listCocRecords, getCocRecord, deleteCocRecord,
} from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardList, Eye, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { buildCocPdf, safeFileName, type CocFieldLite } from "@/lib/coc-pdf";
import {
  listCocDrafts, deleteCocDraft, subscribeCocDrafts, type CocDraft,
} from "@/lib/coc-drafts";
import { qk } from "@/lib/query-keys";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import { CocViewDialog } from "@/components/chain-of-custody/coc-view-dialog";
import type { CocField, CocRecord } from "@/components/chain-of-custody/types";

export const Route = createFileRoute("/_authenticated/chain-of-custody")({ component: CocPage });

function CocPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const listRecords = useServerFn(listCocRecords);
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const del = useServerFn(deleteCocRecord);

  const { data: records = [], isLoading } = useQuery({
    queryKey: qk.cocRecords.list(),
    queryFn: () => listRecords() as Promise<CocRecord[]>,
  });
  const { data: fields = [] } = useQuery({
    queryKey: qk.cocFields.list(),
    queryFn: () => listFields() as Promise<CocField[]>,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: qk.cocRecords.list() }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  function openNew() { setEditingId(null); setResumeDraftId(null); setOpen(true); }
  function openEdit(id: string) { setEditingId(id); setResumeDraftId(null); setOpen(true); }
  function openDraft(d: CocDraft) {
    setEditingId(d.recordId);
    setResumeDraftId(d.draftId);
    setOpen(true);
  }

  // Drafts panel — live from localStorage
  const [drafts, setDrafts] = useState<CocDraft[]>(() => listCocDrafts());
  useEffect(() => {
    setDrafts(listCocDrafts());
    return subscribeCocDrafts(() => setDrafts(listCocDrafts()));
  }, []);

  const fieldsForPdf: CocFieldLite[] = useMemo(
    () => fields.map(f => ({ field_key: f.field_key, label: f.label })),
    [fields]
  );

  function toggleOne(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(records.map(r => r.id)) : new Set());
  }

  async function downloadOne(id: string) {
    try {
      const rec = (await getRec({ data: { id } })) as CocRecord;
      const doc = buildCocPdf(rec, fieldsForPdf);
      doc.save(`COC_${safeFileName(rec.sample_id)}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download");
    }
  }

  async function downloadSelected() {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const ids = Array.from(selected);
      if (ids.length === 1) {
        await downloadOne(ids[0]);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const id of ids) {
          const rec = (await getRec({ data: { id } })) as CocRecord;
          const doc = buildCocPdf(rec, fieldsForPdf);
          zip.file(`COC_${safeFileName(rec.sample_id)}_${id.slice(0, 8)}.pdf`, doc.output("blob"));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chain-of-custody-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(`Downloaded ${ids.length} record${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk download failed");
    } finally {
      setDownloading(false);
    }
  }

  const allChecked = records.length > 0 && selected.size === records.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Receipt</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Chain of Custody</h1>
          <p className="text-sm text-muted-foreground mt-1">Documented record of every sample received by the lab.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-1" /> New Chain of Custody
        </Button>
      </div>

      {drafts.length > 0 && (
        <Card className="mb-4 border-dashed border-primary/40 bg-primary/[0.03]">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" />
            <div className="text-sm font-medium">Drafts in progress</div>
            <Badge variant="secondary" className="text-[10px]">{drafts.length}</Badge>
            <span className="text-xs text-muted-foreground ml-1">Auto-saved in this browser.</span>
          </div>
          <ul className="divide-y divide-border">
            {drafts.map(d => (
              <li key={d.draftId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {d.summary || (d.recordId ? "Editing existing record" : "New chain of custody")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.recordId ? "Edit draft" : "New CoC draft"} · saved {new Date(d.updatedAt).toLocaleString()}
                    {d.pendingFileNames.length > 0 && ` · ${d.pendingFileNames.length} photo${d.pendingFileNames.length === 1 ? "" : "s"} pending (re-attach on resume)`}
                  </div>
                </div>
                <Button size="sm" variant="default" onClick={() => openDraft(d)}>Resume</Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => { if (confirm("Discard this draft?")) deleteCocDraft(d.draftId); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {records.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label="Select all"
          />
          <span>
            {selected.size > 0 ? `${selected.size} selected` : `Select records to download`}
          </span>
          <div className="flex-1" />
          <Button
            size="sm" variant="outline"
            disabled={selected.size === 0 || downloading}
            onClick={downloadSelected}
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
            No chain of custody records yet. Click <span className="font-medium">New Chain of Custody</span> to create one.
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
                    onCheckedChange={(v) => toggleOne(r.id, v === true)}
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
                  <Button size="sm" variant="ghost" onClick={() => setViewingId(r.id)}>
                    <Eye className="size-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadOne(r.id)}>
                    <Download className="size-3.5 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(r.id)}>
                    <Pencil className="size-3.5 mr-1" /> Edit
                  </Button>
                  {role === "admin" && (
                    <Button size="icon" variant="ghost"
                      onClick={() => { if (confirm(`Delete record ${r.sample_id}?`)) delMut.mutate(r.id); }}
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

      <CocFormDialog
        open={open}
        onOpenChange={setOpen}
        recordId={editingId}
        resumeDraftId={resumeDraftId}
      />
      <CocViewDialog
        recordId={viewingId}
        onOpenChange={(v) => { if (!v) setViewingId(null); }}
        fields={fields}
        onDownload={(id) => downloadOne(id)}
      />
    </div>
  );
}