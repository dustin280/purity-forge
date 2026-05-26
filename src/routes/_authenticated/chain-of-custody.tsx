/**
 * Chain of Custody listing route. Orchestrates data fetching, mutations,
 * and delegates all presentation to components under `@/components/chain-of-custody/*`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import { CocViewDialog } from "@/components/chain-of-custody/coc-view-dialog";
import { DraftsPanel } from "@/components/chain-of-custody/drafts-panel";
import { RecordsList } from "@/components/chain-of-custody/records-list";
import { PageHeader } from "@/components/chain-of-custody/page-header";
import { useCocDrafts } from "@/components/chain-of-custody/use-coc-drafts";
import { useCocSelection } from "@/components/chain-of-custody/use-coc-selection";
import { useCocDownloads } from "@/components/chain-of-custody/use-coc-downloads";
import { useCocRecords } from "@/components/chain-of-custody/use-coc-records";
import { useCocDialogs } from "@/components/chain-of-custody/use-coc-dialogs";

export const Route = createFileRoute("/_authenticated/chain-of-custody")({ component: CocPage });

function CocPage() {
  const { role } = useAuth();
  const { records, fields, isLoading, deleteWithConfirm } = useCocRecords();
  const {
    open, setOpen, editingId, viewingId, resumeDraftId,
    setViewingId, openNew, openEdit, openDraft,
  } = useCocDialogs();
  const drafts = useCocDrafts();
  const recordIds = useMemo(() => records.map(r => r.id), [records]);
  const { selected, toggleOne, toggleAll } = useCocSelection(recordIds);
  const { downloading, downloadOne, downloadSelected } = useCocDownloads(fields);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
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
        onDelete={deleteWithConfirm}
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
