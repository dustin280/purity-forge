/**
 * Create / edit dialog for a Chain of Custody record. Owns the multi-section
 * form state (header fields + per-row compounds), auto-saves to localStorage
 * via the coc-drafts helpers on every change, and handles attachment uploads
 * after a successful submit. The parent only controls open/close, the record
 * id being edited, and an optional draft id to resume.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  listCocFields, getCocRecord, updateCocRecord, submitCocWithSamples,
  listParameters, nextCocInvoiceNumber,
  recordCocAttachment, listCocAttachments, deleteCocAttachment, signedCocAttachmentUrl,
} from "@/lib/lims.functions";
import {
  getCocDraft, saveCocDraft, deleteCocDraft, newDraftId,
} from "@/lib/coc-drafts";
import { qk } from "@/lib/query-keys";
import { AttachmentsSection } from "./attachments-section";
import { LineItemRow } from "./line-item-row";
import { emptyLine, type CocField, type CocRecord, type LineItem } from "./types";

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

export function CocFormDialog({ open, onOpenChange, recordId, resumeDraftId }: {
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
    queryKey: qk.cocFields.list(),
    queryFn: () => listFields() as Promise<CocField[]>,
    enabled: open,
  });
  const { data: existing } = useQuery({
    queryKey: qk.cocRecords.detail(recordId),
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: open && !!recordId,
  });

  const activeFields = useMemo(() => fields.filter(f => f.is_active), [fields]);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
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
    queryKey: qk.testParameters.list(),
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
        client_received_date: (li as unknown as { client_received_date?: string }).client_received_date ?? "",
        manufacture_date: (li as unknown as { manufacture_date?: string }).manufacture_date ?? "",
        physical_description: (li as unknown as { physical_description?: string }).physical_description ?? "",
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
      qc.invalidateQueries({ queryKey: qk.cocRecords.list() });
      qc.invalidateQueries({ queryKey: qk.intake.list() });
      qc.invalidateQueries({ queryKey: qk.samples.list() });
      qc.invalidateQueries({ queryKey: qk.cocRecords.attachmentsAll });
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
    queryKey: qk.cocRecords.attachments(recordId),
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
          {activeFields
            // Hide the legacy header-level "requested_tests" multiselect — it's now per row.
            .filter(f => f.field_key !== "requested_tests")
            .map(f => (
              <React.Fragment key={f.id}>
                <div className={f.field_type === "textarea" || f.field_type === "multiselect" ? "sm:col-span-2" : ""}>
                  <Label htmlFor={f.field_key} className="text-xs">
                    {f.label}{f.is_required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <div className="mt-1">{renderField(f)}</div>
                </div>
                {f.field_key === "packaging_condition" && (
                  <AttachmentsSection
                    attachments={attachments}
                    pendingFiles={pendingFiles}
                    onAddFiles={(files) => { setIsDirty(true); setPendingFiles(prev => [...prev, ...files]); }}
                    onRemovePending={(idx) => { setIsDirty(true); setPendingFiles(prev => prev.filter((_, i) => i !== idx)); }}
                    onDeleteExisting={async (id) => {
                      if (!confirm("Delete this attachment?")) return;
                      await deleteAttachment({ data: { id } });
                      qc.invalidateQueries({ queryKey: qk.cocRecords.attachments(recordId) });
                    }}
                    onOpenExisting={async (path) => {
                      const r = await signAttachmentUrl({ data: { file_path: path, expires_in: 600 } }) as { url: string };
                      window.open(r.url, "_blank");
                    }}
                  />
                )}
              </React.Fragment>
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
                  <LineItemRow
                    li={li}
                    disabled={!!recordId}
                    onChange={(patch) => setLineItemsDirty(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))}
                    testOptions={activeParams}
                    pendingFiles={pendingByLine[idx] ?? []}
                    onAddFiles={(files) => { setIsDirty(true); setPendingByLine(prev => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...files] })); }}
                    onRemoveFile={(fileIdx) => { setIsDirty(true); setPendingByLine(prev => ({ ...prev, [idx]: (prev[idx] ?? []).filter((_, i) => i !== fileIdx) })); }}
                  />
                </div>
              ))}
            </div>
            {!recordId && (
              <div className="mt-3">
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setLineItemsDirty(prev => [...prev, emptyLine()])}>
                  <Plus className="size-3.5 mr-1" /> Add row
                </Button>
              </div>
            )}
            {recordId && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Line items are locked after submission to keep Sample IDs stable. Edits to individual samples happen in Intake / Samples.
              </p>
            )}
          </div>

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