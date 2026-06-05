/**
 * State + side-effects for the Create/Edit Chain of Custody dialog: loads
 * fields and the existing record, hydrates from a localStorage draft when
 * resuming, autosaves on every meaningful change, drives the save mutation,
 * and uploads pending attachments after a successful submit.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listCocFields, getCocRecord, updateCocRecord, submitCocWithSamples,
  listParameters, nextCocInvoiceNumber,
  recordCocAttachment, listCocAttachments, deleteCocAttachment, signedCocAttachmentUrl,
} from "@/lib/lims.functions";
import {
  getCocDraft, saveCocDraft, deleteCocDraft, newDraftId,
} from "@/lib/coc-drafts";
import { qk } from "@/lib/query-keys";
import { emptyLine, type CocField, type CocRecord, type LineItem } from "./types";
import { uploadPendingCocAttachments } from "./coc-form-uploads";
import { createClient as createClientFn, type ClientRow } from "@/lib/clients.functions";

export type CocAttachment = {
  id: string; file_path: string; file_name: string; content_type: string | null;
};

export function useCocForm({
  open, recordId, resumeDraftId, onOpenChange,
}: {
  open: boolean;
  recordId: string | null;
  resumeDraftId: string | null;
  onOpenChange: (v: boolean) => void;
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
  const listParams = useServerFn(listParameters);

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
  const { data: allParams = [] } = useQuery({
    queryKey: qk.testParameters.list(),
    queryFn: () => listParams(),
    enabled: open,
  });
  const { data: attachments = [] } = useQuery({
    queryKey: qk.cocRecords.attachments(recordId),
    queryFn: () => listAttachments({ data: { coc_id: recordId! } }) as Promise<CocAttachment[]>,
    enabled: open && !!recordId,
  });

  const activeFields = useMemo(() => fields.filter(f => f.is_active), [fields]);
  const activeParams = allParams.filter((p: { is_active: boolean }) => p.is_active);

  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingByLine, setPendingByLine] = useState<Record<number, File[]>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [registerNewClient, setRegisterNewClient] = useState(false);
  const createClient = useServerFn(createClientFn);

  const setValuesDirty: typeof setValues = (v) => { setIsDirty(true); setValues(v); };
  const setLineItemsDirty: typeof setLineItems = (v) => { setIsDirty(true); setLineItems(v); };

  /** Apply a selected client to the form's client info fields. */
  function applyClient(c: ClientRow) {
    setValuesDirty(prev => ({
      ...prev,
      client_company: c.company_name ?? "",
      client_contact_name: c.primary_contact_name ?? "",
      client_contact_email: c.primary_contact_email ?? "",
      client_contact_phone: c.primary_contact_phone ?? "",
      client_address: c.address ?? "",
    }));
    setRegisterNewClient(false);
  }

  // Hydration signature — re-runs init when relevant inputs change.
  const sig = `${open ? "1" : "0"}|${recordId ?? "new"}|${resumeDraftId ?? ""}|${activeFields.map(f => f.field_key).join(",")}|${existing?.id ?? ""}`;
  useEffect(() => {
    if (!open) return;
    setHydrated(false);

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
    if (recordId && existing?.sample_id) {
      init.sample_id = existing.sample_id;
    }
    const merged: Record<string, string | string[]> = { ...init, ...(resumed?.values ?? {}) };
    setValues(merged);

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
    if (!recordId && !resumed && activeFields.some(f => f.field_key === "sample_id")) {
      nextInvoice().then((r) => {
        const inv = (r as { invoice: string }).invoice;
        setValues(prev => (prev.sample_id ? prev : { ...prev, sample_id: inv }));
      }).catch(() => { /* leave blank on failure */ });
    }
    setTimeout(() => setHydrated(true), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  async function uploadAllPendingTo(cocId: string) {
    await uploadPendingCocAttachments(cocId, pendingFiles, pendingByLine, recordAttachment);
  }

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
      // Optionally register a new client from the values entered in this form.
      if (registerNewClient) {
        const company = (values.client_company as string)?.trim();
        if (company) {
          try {
            await createClient({ data: {
              company_name: company,
              address: (values.client_address as string)?.trim() || null,
              primary_contact_name: (values.client_contact_name as string)?.trim() || null,
              primary_contact_email: (values.client_contact_email as string)?.trim() || null,
              primary_contact_phone: (values.client_contact_phone as string)?.trim() || null,
            }});
            toast.success("Client added to directory");
          } catch (err) {
            toast.error(err instanceof Error
              ? `Saved CoC but client not added: ${err.message}`
              : "Saved CoC but client not added");
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(recordId ? "Record updated" : "CoC submitted — samples added to Intake queue");
      qc.invalidateQueries({ queryKey: qk.cocRecords.list() });
      qc.invalidateQueries({ queryKey: qk.intake.list() });
      qc.invalidateQueries({ queryKey: qk.samples.list() });
      qc.invalidateQueries({ queryKey: qk.cocRecords.attachmentsAll });
      qc.invalidateQueries({ queryKey: qk.clients.all });
      if (draftId) deleteCocDraft(draftId);
      setIsDirty(false);
      setPendingFiles([]);
      setPendingByLine({});
      setRegisterNewClient(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  function attemptClose() {
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

  async function openExistingAttachment(path: string) {
    const r = await signAttachmentUrl({ data: { file_path: path, expires_in: 600 } }) as { url: string };
    window.open(r.url, "_blank");
  }

  async function deleteExistingAttachment(id: string) {
    if (!confirm("Delete this attachment?")) return;
    await deleteAttachment({ data: { id } });
    qc.invalidateQueries({ queryKey: qk.cocRecords.attachments(recordId) });
  }

  return {
    activeFields, activeParams, attachments,
    values, setValues, setValuesDirty,
    lineItems, setLineItems, setLineItemsDirty,
    pendingFiles, setPendingFiles, setIsDirty, isDirty,
    pendingByLine, setPendingByLine,
    saveMut, attemptClose,
    openExistingAttachment, deleteExistingAttachment,
    registerNewClient, setRegisterNewClient, applyClient,
  };
}