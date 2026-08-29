/**
 * State + side-effects for the Create/Edit Chain of Custody dialog: loads
 * fields and the existing record, hydrates from a localStorage draft when
 * resuming, autosaves on every meaningful change, drives the save mutation,
 * and uploads pending attachments after a successful submit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listCocFields, getCocRecord, updateCocRecord, submitCocWithLots,
  listParameters, nextCocInvoiceNumber,
  recordCocAttachment, listCocAttachments, deleteCocAttachment, signedCocAttachmentUrl,
} from "@/lib/lims.functions";
import {
  getCocDraft, saveCocDraft, deleteCocDraft, newDraftId,
} from "@/lib/coc-drafts";
import { saveDraftFiles, getDraftFiles, deleteDraftFiles } from "@/lib/coc-draft-files";
import { qk } from "@/lib/query-keys";
import { emptyLot, type CocField, type CocRecord, type LotRow } from "./types";
import { uploadPendingCocAttachments } from "./coc-form-uploads";
import { createClient as createClientFn, type ClientRow } from "@/lib/clients.functions";
import { listCompounds, createCompound as createCompoundFn } from "@/lib/compounds.functions";
import type { CompoundOption } from "@/components/compounds/compound-picker";
import { nowDatetimeInput, toDateInput, toLocalDatetimeInput } from "@/lib/date-input";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";

export type CocAttachment = {
  id: string; file_path: string; file_name: string; content_type: string | null;
};

export type CocFormSeed = {
  values: Record<string, string | string[]>;
  lots: LotRow[];
  pendingOrderId: string | null;
  /** Stable key so re-opening a DIFFERENT order re-hydrates the form. */
  seedKey: string;
};

export function useCocForm({
  open, recordId, resumeDraftId, onOpenChange, initialFile, seed,
}: {
  open: boolean;
  recordId: string | null;
  resumeDraftId: string | null;
  onOpenChange: (v: boolean) => void;
  initialFile?: File | null;
  /** Pre-fill supplied in memory (e.g. receiving a partner order) rather
   *  than via a persisted draft -- so merely opening the form doesn't
   *  leave a draft behind if it's closed without any edits. */
  seed?: CocFormSeed | null;
}) {
  const qc = useQueryClient();
  const signalWorkflowEvent = useWorkflowSignal();
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const submit = useServerFn(submitCocWithLots);
  const update = useServerFn(updateCocRecord);
  const nextInvoice = useServerFn(nextCocInvoiceNumber);
  const recordAttachment = useServerFn(recordCocAttachment);
  const listAttachments = useServerFn(listCocAttachments);
  const deleteAttachment = useServerFn(deleteCocAttachment);
  const signAttachmentUrl = useServerFn(signedCocAttachmentUrl);
  const listParams = useServerFn(listParameters);
  const listCompoundsFn = useServerFn(listCompounds);
  const createCompoundFnCall = useServerFn(createCompoundFn);

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
  const { data: compoundRows = [] } = useQuery({
    queryKey: qk.compounds.list(),
    queryFn: () => listCompoundsFn(),
    enabled: open,
  });
  const compoundOptions: CompoundOption[] = compoundRows
    .filter((c) => c.is_active)
    .map((c) => ({ id: c.id, name: c.name, default_appearance: c.default_appearance }));
  async function createCompoundOption(name: string): Promise<CompoundOption> {
    const row = await createCompoundFnCall({ data: { name } });
    qc.invalidateQueries({ queryKey: qk.compounds.all });
    return { id: row.id, name: row.name };
  }

  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [lots, setLots] = useState<LotRow[]>([emptyLot()]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingByLine, setPendingByLine] = useState<Record<number, File[]>>({});
  /** Per-vial photos, keyed "lotIndex:vialIndex" (both 0-based). */
  const [pendingByVial, setPendingByVial] = useState<Record<string, File[]>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [registerNewClient, setRegisterNewClient] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const createClient = useServerFn(createClientFn);

  const setValuesDirty: typeof setValues = (v) => { setIsDirty(true); setValues(v); };
  const setLotsDirty: typeof setLots = (v) => { setIsDirty(true); setLots(v); };

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
  const sig = `${open ? "1" : "0"}|${recordId ?? "new"}|${resumeDraftId ?? ""}|${seed?.seedKey ?? ""}|${activeFields.map(f => f.field_key).join(",")}|${existing?.id ?? ""}`;
  useEffect(() => {
    if (!open) return;
    setHydrated(false);

    const resumed = resumeDraftId ? getCocDraft(resumeDraftId) : null;
    const id = resumed?.draftId ?? newDraftId(recordId ? `edit-${recordId.slice(0, 8)}` : "new");
    setDraftId(id);
    draftIdRef.current = id;
    setPendingOrderId(resumed?.pendingOrderId ?? seed?.pendingOrderId ?? null);

    const init: Record<string, string | string[]> = {};
    activeFields.forEach(f => {
      const v = existing?.data?.[f.field_key];
      if (f.field_type === "multiselect") {
        init[f.field_key] = Array.isArray(v) ? v : [];
      } else if (f.field_type === "datetime") {
        const norm = toLocalDatetimeInput(v == null ? "" : String(v));
        // New receipts default to "now" so the picker is never half-filled.
        init[f.field_key] = norm || (recordId ? "" : nowDatetimeInput());
      } else if (f.field_type === "date") {
        init[f.field_key] = toDateInput(v == null ? "" : String(v));
      } else {
        init[f.field_key] = v == null ? "" : String(v);
      }
    });
    if (recordId && existing?.sample_id) {
      init.sample_id = existing.sample_id;
    }
    const merged: Record<string, string | string[]> = { ...init, ...(resumed?.values ?? seed?.values ?? {}) };
    // Resumed drafts can carry values saved before normalization existed.
    activeFields.forEach(f => {
      if (f.field_type === "datetime") {
        merged[f.field_key] = toLocalDatetimeInput(merged[f.field_key] as string) || (init[f.field_key] as string);
      } else if (f.field_type === "date") {
        merged[f.field_key] = toDateInput(merged[f.field_key] as string);
      }
    });
    setValues(merged);

    // Only rows already in the three-level shape (they carry `vials`) can
    // hydrate here. A draft or record saved in the older flat line-item
    // shape is ignored rather than half-converted -- silently mangling a
    // saved intake would be worse than starting the lot list fresh.
    const isLotShaped = (r: unknown): r is LotRow =>
      !!r && typeof r === "object" && Array.isArray((r as LotRow).vials);
    const resumedLots = (resumed?.lineItems as unknown[] | undefined)?.filter(isLotShaped);
    const existingLots = (existing as unknown as { line_items?: unknown[] } | undefined)?.line_items?.filter(isLotShaped);
    if (resumedLots && resumedLots.length) {
      setLots(resumedLots.map(l => ({ ...emptyLot(), ...l })));
    } else if (existingLots && existingLots.length) {
      setLots(existingLots.map(l => ({ ...emptyLot(), ...l })));
    } else if (seed?.lots?.length) {
      setLots(seed.lots.map(l => ({ ...emptyLot(), ...l })));
    } else {
      setLots([emptyLot()]);
    }
    setIsDirty(!!resumed);
    setPendingFiles(initialFile ? [initialFile] : []);
    if (initialFile) setIsDirty(true);
    setPendingByLine({});
    setPendingByVial({});
    if (!recordId && !resumed && !seed) {
      nextInvoice().then((r) => {
        const inv = (r as { invoice: string }).invoice;
        setValues(prev => (prev.sample_id ? prev : { ...prev, sample_id: inv }));
      }).catch(() => { /* leave blank on failure */ });
    }
    // Pending attachment files live in IndexedDB (see coc-draft-files.ts),
    // not the localStorage draft — reload them separately, async. Guard
    // against a stale write landing after the dialog has since moved on to
    // a different draft, via a ref updated synchronously on every run.
    if (resumed) {
      getDraftFiles(resumed.draftId).then((files) => {
        if (!files || draftIdRef.current !== id) return;
        if (files.pendingFiles.length) setPendingFiles(files.pendingFiles);
        if (Object.keys(files.pendingByLine).length) setPendingByLine(files.pendingByLine);
      }).catch(() => { /* leave empty on failure */ });
    }
    setTimeout(() => setHydrated(true), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  async function uploadAllPendingTo(cocId: string) {
    await uploadPendingCocAttachments(cocId, pendingFiles, pendingByLine, recordAttachment, pendingByVial);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      let sampleIdVal = (values.sample_id as string)?.trim();
      if (!sampleIdVal && !recordId) {
        // Just-in-time fallback: generate one if it's still blank.
        try {
          const r = await nextInvoice() as { invoice: string };
          sampleIdVal = r.invoice;
          setValues(prev => ({ ...prev, sample_id: r.invoice }));
        } catch { /* fall through to error below */ }
      }
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
        // A lot is submittable once it names at least one compound and has
        // at least one vial. Blank compound rows are dropped rather than
        // rejected, so a half-filled extra row doesn't block submit.
        const cleaned = lots
          .map(l => ({ ...l, components: l.components.filter(c => c.compound.trim() !== "") }))
          .filter(l => l.components.length > 0 && l.vials.length > 0);
        if (cleaned.length === 0) throw new Error("Add at least one lot with a compound and one vial");
        const res = await submit({ data: {
          sample_id: sampleIdVal, data, lots: cleaned,
          pending_order_id: pendingOrderId ?? undefined,
        } }) as { coc: { id: string } };
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
      qc.invalidateQueries({ queryKey: ["pending_orders"] });
      if (!recordId) signalWorkflowEvent("coc-submitted");
      if (draftId) { deleteCocDraft(draftId); void deleteDraftFiles(draftId); }
      setIsDirty(false);
      setPendingFiles([]);
      setPendingByLine({});
      setPendingByVial({});
      setRegisterNewClient(false);
      setPendingOrderId(null);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  function attemptClose() {
    setIsDirty(false);
    setPendingFiles([]);
    setPendingByLine({});
    setPendingByVial({});
    if (draftId && getCocDraft(draftId)) {
      toast.info(pendingOrderId
        ? "Draft saved — resume it from this order on the Pending Orders page."
        : "Draft saved — resume it from the Drafts panel on the Sample Receipt page.");
    }
    onOpenChange(false);
  }

  // Autosave to localStorage (+ IndexedDB for the actual file bytes) on
  // every change (skip empty/initial state).
  useEffect(() => {
    if (!open || !hydrated || !draftId) return;
    // Only persist once something has actually been changed. A form opened
    // and closed without edits (e.g. clicking Receive just to look at an
    // order) must not leave a draft behind -- that's what stuck the
    // "Resume Draft" button on permanently.
    if (!isDirty) return;
    const hasValues = Object.values(values).some(v => Array.isArray(v) ? v.length > 0 : (typeof v === "string" && v.trim() !== ""));
    const hasLines = lots.some(l => l.components.some(c => c.compound.trim() !== "") || l.customer_lot.trim() !== "" || l.catalog.trim() !== "");
    const hasPending = pendingFiles.length > 0
      || Object.values(pendingByLine).some(arr => arr.length > 0)
      || Object.values(pendingByVial).some(arr => arr.length > 0);
    if (!hasValues && !hasLines && !hasPending) return;
    const summaryParts: string[] = [];
    const invoice = (values.sample_id as string)?.trim();
    if (invoice) summaryParts.push(invoice);
    const firstCompound = lots.flatMap(l => l.components).find(c => c.compound.trim() !== "")?.compound.trim();
    if (firstCompound) summaryParts.push(firstCompound);
    const client = (values.client_company as string)?.trim();
    if (client) summaryParts.push(client);
    saveCocDraft({
      draftId,
      recordId: recordId ?? null,
      values,
      lineItems: lots,
      pendingFileNames: pendingFiles.map(f => f.name),
      updatedAt: new Date().toISOString(),
      summary: summaryParts.join(" · ") || (recordId ? "Editing existing record" : "New chain of custody"),
      pendingOrderId: pendingOrderId ?? null,
    });
    if (hasPending) void saveDraftFiles(draftId, { pendingFiles, pendingByLine });
  }, [open, hydrated, isDirty, draftId, values, lots, pendingFiles, pendingByLine, pendingByVial, recordId, pendingOrderId]);

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
    compoundOptions, createCompoundOption,
    values, setValues, setValuesDirty,
    lots, setLots, setLotsDirty,
    pendingFiles, setPendingFiles, setIsDirty, isDirty,
    pendingByLine, setPendingByLine,
    pendingByVial, setPendingByVial,
    saveMut, attemptClose,
    openExistingAttachment, deleteExistingAttachment,
    registerNewClient, setRegisterNewClient, applyClient,
  };
}