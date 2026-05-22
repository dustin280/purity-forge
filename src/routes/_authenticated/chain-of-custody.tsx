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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { buildCocPdf, safeFileName, type CocFieldLite } from "@/lib/coc-pdf";
import {
  listCocDrafts, subscribeCocDrafts, type CocDraft,
} from "@/lib/coc-drafts";
import { qk } from "@/lib/query-keys";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import { CocViewDialog } from "@/components/chain-of-custody/coc-view-dialog";
import { DraftsPanel } from "@/components/chain-of-custody/drafts-panel";
import { RecordsList } from "@/components/chain-of-custody/records-list";
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

      <DraftsPanel drafts={drafts} onResume={openDraft} />

      <RecordsList
        records={records}
        isLoading={isLoading}
        isAdmin={role === "admin"}
        selected={selected}
        onToggleOne={toggleOne}
        onToggleAll={toggleAll}
        downloading={downloading}
        onDownloadSelected={downloadSelected}
        onView={(id) => setViewingId(id)}
        onDownloadOne={downloadOne}
        onEdit={openEdit}
        onDelete={(r) => { if (confirm(`Delete record ${r.sample_id}?`)) delMut.mutate(r.id); }}
      />

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