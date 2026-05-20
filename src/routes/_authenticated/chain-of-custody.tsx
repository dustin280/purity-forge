import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  listCocFields, listCocRecords, getCocRecord,
  updateCocRecord, deleteCocRecord, submitCocWithSamples,
  listParameters, nextCocInvoiceNumber,
  recordCocAttachment, listCocAttachments, deleteCocAttachment, signedCocAttachmentUrl,
} from "@/lib/lims.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardList, Eye, Download, X, Trash, Camera, Upload, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { buildCocPdf, safeFileName, type CocFieldLite } from "@/lib/coc-pdf";
import {
  listCocDrafts, getCocDraft, saveCocDraft, deleteCocDraft,
  newDraftId, subscribeCocDrafts, type CocDraft,
} from "@/lib/coc-drafts";

export const Route = createFileRoute("/_authenticated/chain-of-custody")({ component: CocPage });

type CocField = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "date" | "datetime" | "email" | "tel" | "multiselect";
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  placeholder: string | null;
};
type CocRecord = { id: string; sample_id: string; data: Record<string, unknown>; created_at: string };

function CocPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const listRecords = useServerFn(listCocRecords);
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const del = useServerFn(deleteCocRecord);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["coc_records"],
    queryFn: () => listRecords() as Promise<CocRecord[]>,
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["coc_fields"],
    queryFn: () => listFields() as Promise<CocField[]>,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: ["coc_records"] }); },
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

function CocViewDialog({ recordId, onOpenChange, fields, onDownload }: {
  recordId: string | null;
  onOpenChange: (v: boolean) => void;
  fields: CocField[];
  onDownload: (id: string) => void;
}) {
  const getRec = useServerFn(getCocRecord);
  const { data: rec } = useQuery({
    queryKey: ["coc_record_view", recordId],
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: !!recordId,
  });
  const open = !!recordId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Chain of Custody {rec ? `— ${rec.sample_id}` : ""}
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

function CocFormDialog({ open, onOpenChange, recordId, resumeDraftId }: {
  open: boolean; onOpenChange: (v: boolean) => void; recordId: string | null;
  resumeDraftId: string | null;
}) {
  const qc = useQueryClient();
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const submit = useServerFn(submitCocWithSamples);
  const update = useServerFn(updateCocRecord);
  const nextInvoice = useServerFn(nextCocInvoiceNumber);
  const recordAttachment = useServerFn(recordCocAttachment);
  const listAttachments = useServerFn(listCocAttachments);
  const deleteAttachment = useServerFn(deleteCocAttachment);
  const signAttachmentUrl = useServerFn(signedCocAttachmentUrl);

  const { data: fields = [] } = useQuery({
    queryKey: ["coc_fields"],
    queryFn: () => listFields() as Promise<CocField[]>,
    enabled: open,
  });
  const { data: existing } = useQuery({
    queryKey: ["coc_record", recordId],
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: open && !!recordId,
  });

  const activeFields = useMemo(() => fields.filter(f => f.is_active), [fields]);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  type LineItem = {
    compound: string; lot: string; catalog: string; manufacturer: string;
    quantity: string; quantity_unit: string;
    container_size: string; concentration: string;
    vial_count: number; temperature_c: string;
    storage: string; requested_tests: string[];
  };
  const emptyLine = (): LineItem => ({
    compound: "", lot: "", catalog: "", manufacturer: "",
    quantity: "", quantity_unit: "",
    container_size: "", concentration: "",
    vial_count: 1, temperature_c: "",
    storage: "", requested_tests: [],
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    emptyLine(),
  ]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Per-row pending photos: key = line item index (-1 reserved for package condition)
  const [pendingByLine, setPendingByLine] = useState<Record<number, File[]>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  // Once true, autosave is allowed to write (suppresses overwrite during initial hydration).
  const [hydrated, setHydrated] = useState(false);

  // Wrap state setters so any user edit flips dirty
  const setValuesDirty: typeof setValues = (v) => { setIsDirty(true); setValues(v); };
  const setLineItemsDirty: typeof setLineItems = (v) => { setIsDirty(true); setLineItems(v); };

  const listParams = useServerFn(listParameters);
  const { data: allParams = [] } = useQuery({
    queryKey: ["test_parameters"],
    queryFn: () => listParams(),
    enabled: open,
  });
  const activeParams = allParams.filter((p: { is_active: boolean }) => p.is_active);

  // Reset values when dialog opens or data loads
  const sig = `${open ? "1" : "0"}|${recordId ?? "new"}|${resumeDraftId ?? ""}|${activeFields.map(f => f.field_key).join(",")}|${existing?.id ?? ""}`;
  useEffect(() => {
    if (!open) return;
    setHydrated(false);

    // Prefer a resumed draft if one was selected.
    const resumed = resumeDraftId ? getCocDraft(resumeDraftId) : null;
    const id = resumed?.draftId ?? newDraftId(recordId ? `edit-${recordId.slice(0, 8)}` : "new");
    setDraftId(id);

    const init: Record<string, string | string[]> = {};
    activeFields.forEach(f => {
      const v = existing?.data?.[f.field_key];
      if (f.field_type === "multiselect") {
        init[f.field_key] = Array.isArray(v) ? v : [];
      } else {
        init[f.field_key] = v == null ? "" : String(v);
      }
    });
    // For edits, prefer the stored sample_id (invoice #) on the record itself
    if (recordId && existing?.sample_id) {
      init.sample_id = existing.sample_id;
    }
    // Layer the resumed draft on top of the base, so user's in-progress edits win.
    const merged: Record<string, string | string[]> = { ...init, ...(resumed?.values ?? {}) };
    setValues(merged);
    // Hydrate line items
    const resumedLines = (resumed?.lineItems as LineItem[] | undefined);
    const existingItems = (existing as unknown as { line_items?: LineItem[] } | undefined)?.line_items;
    if (resumedLines && resumedLines.length) {
      setLineItems(resumedLines.map(li => ({ ...emptyLine(), ...li })));
    } else if (existingItems && existingItems.length) {
      setLineItems(existingItems.map(li => ({
        compound: li.compound ?? "", lot: li.lot ?? "", catalog: li.catalog ?? "",
        manufacturer: li.manufacturer ?? "", quantity: li.quantity ?? "",
        quantity_unit: li.quantity_unit ?? "",
        container_size: li.container_size ?? "", concentration: li.concentration ?? "",
        vial_count: li.vial_count ?? 1,
        temperature_c: (li as unknown as { temperature_c?: string | number }).temperature_c == null
          ? "" : String((li as unknown as { temperature_c?: string | number }).temperature_c),
        storage: li.storage ?? "", requested_tests: li.requested_tests ?? [],
      })));
    } else {
      setLineItems([emptyLine()]);
    }
    setIsDirty(!!resumed);
    setPendingFiles([]);
    setPendingByLine({});
    // Autofill new invoice # when creating
    if (!recordId && !resumed && activeFields.some(f => f.field_key === "sample_id")) {
      nextInvoice().then((r) => {
        const inv = (r as { invoice: string }).invoice;
        setValues(prev => (prev.sample_id ? prev : { ...prev, sample_id: inv }));
      }).catch(() => { /* leave blank on failure */ });
    }
    // Allow autosave on the next tick (after initial state has flushed).
    setTimeout(() => setHydrated(true), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const sampleIdVal = (values.sample_id as string)?.trim();
      if (!sampleIdVal) throw new Error("Sample ID is required");
      const data: Record<string, string | number | string[] | null> = {};
      activeFields.forEach(f => {
        if (f.field_type === "multiselect") {
          const arr = values[f.field_key];
          data[f.field_key] = Array.isArray(arr) && arr.length ? arr : null;
          return;
        }
        const raw = (values[f.field_key] as string)?.trim() ?? "";
        if (raw === "") { data[f.field_key] = null; return; }
        if (f.field_type === "number") {
          const n = Number(raw);
          data[f.field_key] = isNaN(n) ? raw : n;
        } else {
          data[f.field_key] = raw;
        }
      });
      if (recordId) {
        await update({ data: { id: recordId, sample_id: sampleIdVal, data } });
        await uploadAllPendingTo(recordId);
      } else {
        const cleaned = lineItems
          .map(li => ({ ...li, compound: li.compound.trim() }))
          .filter(li => li.compound.length > 0);
        if (cleaned.length === 0) throw new Error("Add at least one compound / line item");
        const res = await submit({ data: { sample_id: sampleIdVal, data, line_items: cleaned } }) as { coc: { id: string } };
        if (res?.coc?.id) await uploadAllPendingTo(res.coc.id);
      }
    },
    onSuccess: () => {
      toast.success(recordId ? "Record updated" : "CoC submitted — samples added to Intake queue");
      qc.invalidateQueries({ queryKey: ["coc_records"] });
      qc.invalidateQueries({ queryKey: ["intake_queue"] });
      qc.invalidateQueries({ queryKey: ["samples"] });
      qc.invalidateQueries({ queryKey: ["coc_attachments"] });
      if (draftId) deleteCocDraft(draftId);
      setIsDirty(false);
      setPendingFiles([]);
      setPendingByLine({});
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  async function uploadOne(cocId: string, file: File, lineIdx: number | null) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${cocId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("coc-attachments").upload(path, file);
      if (upErr) throw upErr;
      await recordAttachment({ data: {
        coc_id: cocId, file_path: path, file_name: file.name,
        content_type: file.type || null, size_bytes: file.size,
        line_item_index: lineIdx,
      } });
  }

  async function uploadAllPendingTo(cocId: string) {
    for (const file of pendingFiles) {
      await uploadOne(cocId, file, null);
    }
    for (const [idx, files] of Object.entries(pendingByLine)) {
      const i = Number(idx);
      for (const file of files) await uploadOne(cocId, file, i);
    }
  }

  // Existing attachments for edit mode
  const { data: attachments = [] } = useQuery({
    queryKey: ["coc_attachments", recordId],
    queryFn: () => listAttachments({ data: { coc_id: recordId! } }) as Promise<Array<{
      id: string; file_path: string; file_name: string; content_type: string | null;
    }>>,
    enabled: open && !!recordId,
  });

  function attemptClose() {
    // The draft is auto-saved on every change, so closing never destroys data —
    // just let the user know they can resume from the Drafts panel.
    setIsDirty(false);
    setPendingFiles([]);
    if (draftId && getCocDraft(draftId)) {
      toast.info("Draft saved — resume it from the Drafts panel on the Chain of Custody page.");
    }
    onOpenChange(false);
  }

  // Autosave to localStorage on every change (skip empty/initial state).
  useEffect(() => {
    if (!open || !hydrated || !draftId) return;
    // Determine if there's any meaningful content to save
    const hasValues = Object.values(values).some(v => Array.isArray(v) ? v.length > 0 : (typeof v === "string" && v.trim() !== ""));
    const hasLines = lineItems.some(li => li.compound.trim() !== "" || li.lot.trim() !== "" || li.catalog.trim() !== "");
    const hasPending = pendingFiles.length > 0;
    if (!hasValues && !hasLines && !hasPending) return;
    const summaryParts: string[] = [];
    const invoice = (values.sample_id as string)?.trim();
    if (invoice) summaryParts.push(invoice);
    const firstCompound = lineItems.find(li => li.compound.trim() !== "")?.compound.trim();
    if (firstCompound) summaryParts.push(firstCompound);
    const client = (values.client_company as string)?.trim();
    if (client) summaryParts.push(client);
    saveCocDraft({
      draftId,
      recordId: recordId ?? null,
      values,
      lineItems,
      pendingFileNames: pendingFiles.map(f => f.name),
      updatedAt: new Date().toISOString(),
      summary: summaryParts.join(" · ") || (recordId ? "Editing existing record" : "New chain of custody"),
    });
  }, [open, hydrated, draftId, values, lineItems, pendingFiles, recordId]);

  function MultiselectField({ fieldKey, selected, options, onToggle }: {
    fieldKey: string;
    selected: string[];
    options: { id: string; name: string }[];
    onToggle: (name: string) => void;
  }) {
    const [filter, setFilter] = useState("");
    const filtered = options.filter(p =>
      p.name.toLowerCase().includes(filter.toLowerCase())
    );
    return (
      <div className="space-y-2" key={fieldKey}>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(name => (
              <Badge key={name} variant="secondary" className="gap-1">
                {name}
                <button type="button" onClick={() => onToggle(name)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={`Filter ${options.length} parameters…`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-8"
        />
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No parameters available.</div>
          ) : filtered.map(p => {
            const checked = selected.includes(p.name);
            return (
              <label key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox checked={checked} onCheckedChange={() => onToggle(p.name)} />
                <span>{p.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderField(f: CocField) {
    if (f.field_type === "multiselect") {
      const selected = (values[f.field_key] as string[]) ?? [];
      function toggleParam(name: string) {
        setValuesDirty(prev => {
          const arr = new Set((prev[f.field_key] as string[]) ?? []);
          if (arr.has(name)) arr.delete(name); else arr.add(name);
          return { ...prev, [f.field_key]: Array.from(arr) };
        });
      }
      return (
        <MultiselectField
          fieldKey={f.field_key}
          selected={selected}
          options={activeParams}
          onToggle={toggleParam}
        />
      );
    }
    const v = values[f.field_key] as string ?? "";
    const set = (val: string) => setValuesDirty(prev => ({ ...prev, [f.field_key]: val }));
    if (f.field_key === "sample_id") {
      return (
        <Input
          id={f.field_key}
          value={v}
          readOnly
          placeholder={v ? "" : "Generating…"}
          className="font-mono bg-muted/40"
        />
      );
    }
    const common = {
      id: f.field_key,
      value: v,
      placeholder: f.placeholder ?? "",
      required: f.is_required,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value),
    };
    if (f.field_type === "textarea") return <Textarea rows={3} {...common} />;
    const typeMap: Record<string, string> = {
      text: "text", number: "number", date: "date",
      datetime: "datetime-local", email: "email", tel: "tel",
    };
    return <Input type={typeMap[f.field_type] ?? "text"} {...common} />;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) attemptClose(); else onOpenChange(true); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => { e.preventDefault(); attemptClose(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); attemptClose(); }}
        onInteractOutside={(e) => { e.preventDefault(); attemptClose(); }}
      >
        <DialogHeader>
          <DialogTitle>{recordId ? "Edit Chain of Custody" : "New Chain of Custody"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="grid gap-4 py-2 sm:grid-cols-2"
        >
          {activeFields.map(f => (
            <div key={f.id} className={f.field_type === "textarea" || f.field_type === "multiselect" ? "sm:col-span-2" : ""}>
              <Label htmlFor={f.field_key} className="text-xs">
                {f.label}{f.is_required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <div className="mt-1">{renderField(f)}</div>
            </div>
          ))}

          <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label className="text-sm font-semibold">Compounds / Lots</Label>
                <p className="text-xs text-muted-foreground">One row per sample. Each row creates a unique Sample ID on submit.</p>
              </div>
              {!recordId && (
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setLineItemsDirty(prev => [...prev, emptyLine()])}>
                  <Plus className="size-3.5 mr-1" /> Add row
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className="rounded-md border border-border p-3 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Row {String(idx + 1).padStart(2, "0")}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      × {Math.max(1, li.vial_count || 1)} vial{(li.vial_count || 1) === 1 ? "" : "s"}
                    </Badge>
                    {!recordId && lineItems.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" className="size-6 ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() => setLineItemsDirty(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <LineItemRow li={li} disabled={!!recordId}
                    onChange={(patch) => setLineItemsDirty(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))} />
                </div>
              ))}
            </div>
            {recordId && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Line items are locked after submission to keep Sample IDs stable. Edits to individual samples happen in Intake / Samples.
              </p>
            )}
          </div>

          <AttachmentsSection
            attachments={attachments}
            pendingFiles={pendingFiles}
            onAddFiles={(files) => { setIsDirty(true); setPendingFiles(prev => [...prev, ...files]); }}
            onRemovePending={(idx) => { setIsDirty(true); setPendingFiles(prev => prev.filter((_, i) => i !== idx)); }}
            onDeleteExisting={async (id) => {
              if (!confirm("Delete this attachment?")) return;
              await deleteAttachment({ data: { id } });
              qc.invalidateQueries({ queryKey: ["coc_attachments", recordId] });
            }}
            onOpenExisting={async (path) => {
              const r = await signAttachmentUrl({ data: { file_path: path, expires_in: 600 } }) as { url: string };
              window.open(r.url, "_blank");
            }}
          />

          <DialogFooter className="sm:col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={attemptClose}>Cancel</Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : recordId ? "Save changes" : "Submit & stage samples"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LineItemRow({ li, disabled, onChange }: {
  li: {
    compound: string; lot: string; catalog: string; manufacturer: string;
    quantity: string; quantity_unit: string; container_size: string;
    concentration: string; vial_count: number; storage: string;
  };
  disabled: boolean;
  onChange: (patch: Partial<typeof li>) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="sm:col-span-2">
        <Label className="text-[10px] uppercase text-muted-foreground">Product / Compound *</Label>
        <Input className="h-8 mt-1" value={li.compound} disabled={disabled}
          onChange={e => onChange({ compound: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground"># of Vials</Label>
        <Input type="number" min={1} max={99} className="h-8 mt-1" value={li.vial_count} disabled={disabled}
          onChange={e => onChange({ vial_count: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Lot / Batch</Label>
        <Input className="h-8 mt-1" value={li.lot} disabled={disabled}
          onChange={e => onChange({ lot: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Catalog #</Label>
        <Input className="h-8 mt-1" value={li.catalog} disabled={disabled}
          onChange={e => onChange({ catalog: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Manufacturer</Label>
        <Input className="h-8 mt-1" value={li.manufacturer} disabled={disabled}
          onChange={e => onChange({ manufacturer: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Qty / vial</Label>
        <Input className="h-8 mt-1" value={li.quantity} disabled={disabled} placeholder="e.g. 5"
          onChange={e => onChange({ quantity: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Unit</Label>
        <Input className="h-8 mt-1" value={li.quantity_unit} disabled={disabled} placeholder="mg, mL…"
          onChange={e => onChange({ quantity_unit: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Container size</Label>
        <Input className="h-8 mt-1" value={li.container_size} disabled={disabled} placeholder="e.g. 2 mL vial"
          onChange={e => onChange({ container_size: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Concentration / vial</Label>
        <Input className="h-8 mt-1" value={li.concentration} disabled={disabled} placeholder="e.g. 1 mg/mL"
          onChange={e => onChange({ concentration: e.target.value })} />
      </div>
      <div className="sm:col-span-3">
        <Label className="text-[10px] uppercase text-muted-foreground">Storage</Label>
        <Input className="h-8 mt-1" value={li.storage} disabled={disabled}
          onChange={e => onChange({ storage: e.target.value })} />
      </div>
    </div>
  );
}

function AttachmentsSection({
  attachments, pendingFiles, onAddFiles, onRemovePending, onDeleteExisting, onOpenExisting,
}: {
  attachments: Array<{ id: string; file_path: string; file_name: string; content_type: string | null }>;
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemovePending: (idx: number) => void;
  onDeleteExisting: (id: string) => void;
  onOpenExisting: (path: string) => void;
}) {
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
      <Label className="text-sm font-semibold">Package photos & attachments</Label>
      <p className="text-xs text-muted-foreground mb-2">
        Document the package condition. Upload an image or take a photo with your camera.
      </p>
      <div className="flex gap-2 mb-3">
        <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
          <Upload className="size-3.5 mr-1" /> Upload image
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera className="size-3.5 mr-1" /> Take photo
        </Button>
        <input ref={uploadRef} type="file" accept="image/*" multiple hidden
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
      </div>
      {(attachments.length === 0 && pendingFiles.length === 0) ? (
        <div className="text-xs text-muted-foreground italic">No attachments yet.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              <button type="button" className="hover:underline truncate max-w-[160px]" onClick={() => onOpenExisting(a.file_path)}>
                {a.file_name}
              </button>
              <button type="button" onClick={() => onDeleteExisting(a.id)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <Badge variant="outline" className="text-[9px]">pending</Badge>
              <button type="button" onClick={() => onRemovePending(i)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
