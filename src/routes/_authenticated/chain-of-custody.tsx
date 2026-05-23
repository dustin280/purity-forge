/**
 * Chain of Custody listing route. Orchestrates data fetching, mutations,
 * and delegates all presentation to components under `@/components/chain-of-custody/*`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  listCocFields, listCocRecords, deleteCocRecord,
} from "@/lib/lims.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import { CocViewDialog } from "@/components/chain-of-custody/coc-view-dialog";
import { DraftsPanel } from "@/components/chain-of-custody/drafts-panel";
import { RecordsList } from "@/components/chain-of-custody/records-list";
import { PageHeader } from "@/components/chain-of-custody/page-header";
import { useCocDrafts } from "@/components/chain-of-custody/use-coc-drafts";
import { useCocSelection } from "@/components/chain-of-custody/use-coc-selection";
import { useCocDownloads } from "@/components/chain-of-custody/use-coc-downloads";
import type { CocField, CocRecord } from "@/components/chain-of-custody/types";
import type { CocDraft } from "@/lib/coc-drafts";

export const Route = createFileRoute("/_authenticated/chain-of-custody")({ component: CocPage });

function CocPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const listRecords = useServerFn(listCocRecords);
  const listFields = useServerFn(listCocFields);
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

  function openNew() { setEditingId(null); setResumeDraftId(null); setOpen(true); }
  function openEdit(id: string) { setEditingId(id); setResumeDraftId(null); setOpen(true); }
  function openDraft(d: CocDraft) {
    setEditingId(d.recordId);
    setResumeDraftId(d.draftId);
    setOpen(true);
  }

  const drafts = useCocDrafts();
  const recordIds = useMemo(() => records.map(r => r.id), [records]);
  const { selected, toggleOne, toggleAll } = useCocSelection(recordIds);
  const { downloading, downloadOne, downloadSelected } = useCocDownloads(fields);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <PageHeader onNew={openNew} />

      <DraftsPanel drafts={drafts} onResume={openDraft} />

      <RecordsList
        records={records}
        isLoading={isLoading}
        isAdmin={role === "admin"}
        selected={selected}
        onToggleOne={toggleOne}
        onToggleAll={toggleAll}
        downloading={downloading}
        onDownloadSelected={() => downloadSelected(selected)}
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
