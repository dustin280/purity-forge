/**
 * Chain of Custody listing route. Orchestrates data fetching, mutations,
 * and delegates all presentation to components under `@/components/chain-of-custody/*`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { nextCocInvoiceNumber } from "@/lib/lims.functions";
import { buildBlankCocPdf } from "@/lib/coc-blank-pdf";
import { safeFileName } from "@/lib/coc-pdf";
import { OutboundCocDialog } from "@/components/chain-of-custody/outbound-coc-dialog";

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
  const nextInvoice = useServerFn(nextCocInvoiceNumber);
  const [printing, setPrinting] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [outboundOpen, setOutboundOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  async function handlePrintBlank() {
    setPrinting(true);
    try {
      const r = await nextInvoice() as { invoice: string };
      const doc = buildBlankCocPdf(r.invoice, fields.map(f => ({ field_key: f.field_key, label: f.label })));
      doc.save(`COC_Blank_${safeFileName(r.invoice)}.pdf`);
      toast.success(`Issued Lab Sample ID ${r.invoice}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate blank CoC");
    } finally {
      setPrinting(false);
    }
  }

  function handleUploadFilled() {
    uploadInputRef.current?.click();
  }

  function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setInitialFile(file);
    openNew();
    toast.info(`Attached ${file.name} — fill in the sample receipt to complete intake`);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <PageHeader
        onNew={() => { setInitialFile(null); openNew(); }}
        onPrintBlank={handlePrintBlank}
        onUploadFilled={handleUploadFilled}
        onOutboundShipment={() => setOutboundOpen(true)}
        printing={printing}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={onUploadChange}
      />

      {/* Drafts seeded from a pending order live on the Pending Orders page
          instead — that's where they were started, and where "Resume"
          naturally belongs (see pending-orders/index.tsx). */}
      <DraftsPanel drafts={drafts.filter(d => !d.pendingOrderId)} onResume={openDraft} />

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
        onOpenChange={(v) => { if (!v) setInitialFile(null); setOpen(v); }}
        recordId={editingId}
        resumeDraftId={resumeDraftId}
        initialFile={initialFile}
      />
      <CocViewDialog
        recordId={viewingId}
        onOpenChange={(v) => { if (!v) setViewingId(null); }}
        fields={fields}
        onDownload={(id) => downloadOne(id)}
      />
      <OutboundCocDialog open={outboundOpen} onOpenChange={setOutboundOpen} />
    </div>
  );
}
