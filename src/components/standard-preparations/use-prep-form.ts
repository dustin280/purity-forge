import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listStandardSuggestions,
  searchMaterialReceiptsForLink,
  type PrepStep,
} from "@/lib/standard-preparations.functions";
import { qk } from "@/lib/query-keys";
import {
  type ExpirationCode,
  type PrepFormValues,
  type TargetRow,
  addDaysISO,
  calcMassMg,
  clearPrepDraft,
  emptyPrepValues,
  emptyTarget,
  loadDraft,
  periodDays,
} from "./prep-form-logic";

export function usePrepForm(opts: {
  initial?: Partial<PrepFormValues>;
  defaultAnalystName: string;
  draftKey?: string;
}) {
  const { initial, defaultAnalystName, draftKey } = opts;

  const [v, setV] = useState<PrepFormValues>(() => {
    const draft = loadDraft(draftKey);
    return { ...emptyPrepValues(defaultAnalystName), ...initial, ...(draft ?? {}) };
  });
  const dirtyRef = useRef<boolean>(!!loadDraft(draftKey));
  const hasDraft = !!loadDraft(draftKey);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const listSuggestions = useServerFn(listStandardSuggestions);
  const searchReceipts = useServerFn(searchMaterialReceiptsForLink);

  const { data: suggestions = [] } = useQuery({
    queryKey: qk.standardPreps.suggestions(),
    queryFn: () => listSuggestions(),
  });

  const { data: receiptResults = [] } = useQuery({
    queryKey: qk.materialReceipts.search(receiptSearch),
    queryFn: () => searchReceipts({ data: { q: receiptSearch || null, approved_only: true } }),
    enabled: receiptPickerOpen,
  });

  useEffect(() => {
    if (!initial && !v.analyst_name && defaultAnalystName) {
      setV(prev => ({ ...prev, analyst_name: defaultAnalystName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAnalystName]);

  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    try { window.localStorage.setItem(draftKey, JSON.stringify(v)); } catch { /* ignore quota */ }
  }, [v, draftKey]);

  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftKey]);

  const purityNum = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  const computedExpiration = days != null && v.prepared_at ? addDaysISO(v.prepared_at, days) : "";

  const shelfLifeWarning = useMemo(() => {
    if (!v.ref_receipt_date || !v.ref_shelf_life_months) return null;
    const recd = new Date(v.ref_receipt_date);
    const shelfMonths = Number(v.ref_shelf_life_months);
    if (!Number.isFinite(shelfMonths) || shelfMonths <= 0) return null;
    const shelfEnd = new Date(recd);
    shelfEnd.setMonth(shelfEnd.getMonth() + shelfMonths);
    const today = new Date();
    const exp = computedExpiration ? new Date(computedExpiration) : null;
    if (exp && exp > shelfEnd) return `Standard would expire (${computedExpiration}) after material shelf life (${shelfEnd.toISOString().slice(0,10)}).`;
    if (today > shelfEnd) return `Reference material is past its shelf life (${shelfEnd.toISOString().slice(0,10)}).`;
    return null;
  }, [v.ref_receipt_date, v.ref_shelf_life_months, computedExpiration]);

  const calcRows = useMemo(() => v.targets.map((t, i) => {
    const conc = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
    const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
    const mass = conc != null && vol != null ? calcMassMg(conc, vol, purityNum) : null;
    return { idx: i + 1, name: t.name, conc, vol, mass };
  }), [v.targets, purityNum]);

  const procedureText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`1. Reference Material: ${v.ref_material_name || "—"} (Lot ${v.ref_lot || "—"}, Received ${v.ref_receipt_date || "—"}, Purity ${v.ref_purity_percent || "—"}%).`);
    let n = 2;
    calcRows.filter(r => r.mass != null && r.vol != null).forEach(r => {
      lines.push(`${n++}. For ${r.name || `Std #${r.idx}`}: accurately weigh ${r.mass!.toFixed(4)} mg of reference material.`);
      if (v.initial_solvent) lines.push(`${n++}. Dissolve in ${v.initial_solvent}${v.modifier_percent ? ` with ${v.modifier_percent}% modifier` : ""}.`);
      lines.push(`${n++}. Dilute to ${r.vol} mL with ${v.final_diluent || "final diluent"}.`);
    });
    if (computedExpiration) lines.push(`${n++}. Standard expires on ${computedExpiration}.`);
    return lines.join("\n");
  }, [calcRows, v.ref_material_name, v.ref_lot, v.ref_receipt_date, v.ref_purity_percent, v.initial_solvent, v.modifier_percent, v.final_diluent, computedExpiration]);

  const summaryText = useMemo(() => [
    `Reference: ${v.ref_material_name || "—"} (Lot ${v.ref_lot || "—"})`,
    `Receipt date: ${v.ref_receipt_date || "—"}`,
    `Prepared: ${v.prepared_at} by ${v.analyst_name}`,
    `Expiration: ${computedExpiration || v.expiration_date || "—"}`,
    `Targets: ${calcRows.length}`,
  ].join("\n"), [v, computedExpiration, calcRows.length]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  }

  function up<K extends keyof PrepFormValues>(k: K, val: PrepFormValues[K]) {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, [k]: val }));
  }

  function pickSuggestion(name: string) {
    if (!name) return;
    const match = suggestions.find(s => s.name === name);
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      standard_name: name,
      target_concentration: prev.target_concentration || match?.typical_concentration || "",
      solvent: prev.solvent || match?.typical_solvent || "",
    }));
  }

  function linkReceipt(r: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string }) {
    dirtyRef.current = true;
    const x = r as typeof r & {
      received_at?: string;
      purity_percent?: number | null;
      molecular_weight?: number | null;
      shelf_life_months?: number | null;
    };
    setV(prev => ({
      ...prev,
      material_receipt_id: r.id,
      material_receipt_label: `${r.receipt_number} — ${r.material_name}${r.internal_lot ? ` (lot ${r.internal_lot})` : ""}`,
      manufacturer_lot: prev.manufacturer_lot || r.manufacturer_lot || "",
      ref_material_name: r.material_name,
      ref_lot: r.internal_lot || r.manufacturer_lot || "",
      ref_purity_percent: x.purity_percent != null ? String(x.purity_percent) : "",
      ref_molecular_weight: x.molecular_weight != null ? String(x.molecular_weight) : "",
      ref_receipt_date: x.received_at ? x.received_at.slice(0, 10) : "",
      ref_shelf_life_months: x.shelf_life_months != null ? String(x.shelf_life_months) : "",
      material_overridden: false,
    }));
    setReceiptPickerOpen(false);
  }

  function clearReceipt() {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      material_receipt_id: "",
      material_receipt_label: "",
      ref_material_name: "",
      ref_lot: "",
      ref_purity_percent: "",
      ref_molecular_weight: "",
      ref_receipt_date: "",
      ref_shelf_life_months: "",
      material_overridden: false,
    }));
  }

  function markOverridden<K extends keyof PrepFormValues>(k: K, val: PrepFormValues[K]) {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, [k]: val, material_overridden: prev.material_receipt_id ? true : prev.material_overridden }));
  }

  function addTargetRows(n: number) {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, targets: [...prev.targets, ...Array.from({ length: n }, emptyTarget)] }));
  }

  function updateTarget(idx: number, patch: Partial<TargetRow>) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      targets: prev.targets.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }

  function removeTarget(idx: number) {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, targets: prev.targets.filter((_, i) => i !== idx) }));
  }

  function pasteTargets(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const rows: TargetRow[] = lines.map(l => {
      const cols = l.split(/\t|,/).map(c => c.trim());
      return {
        name: cols[0] ?? "",
        target_concentration_mg_per_ml: cols[1] ?? "",
        target_volume_ml: cols[2] ?? "",
        notes: cols[3] ?? "",
      };
    });
    dirtyRef.current = true;
    setV(prev => ({ ...prev, targets: [...prev.targets.filter(t => t.name || t.target_concentration_mg_per_ml || t.target_volume_ml), ...rows] }));
    toast.success(`Added ${rows.length} rows`);
  }

  function addStep() {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: [
        ...prev.preparation_steps,
        { step_no: prev.preparation_steps.length + 1, description: "", amount: "", instrument_id: "", time: "" },
      ],
    }));
  }

  function removeStep(idx: number) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_no: i + 1 })),
    }));
  }

  function updateStep(idx: number, patch: Partial<PrepStep>) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function discardDraft() {
    if (!window.confirm("Discard saved draft and start fresh?")) return;
    clearPrepDraft(draftKey);
    dirtyRef.current = false;
    setV({ ...emptyPrepValues(defaultAnalystName), ...initial });
  }

  function setExpirationCode(code: ExpirationCode) { up("expiration_period_code", code); }

  return {
    v, setV, dirtyRef, hasDraft, suggestions, receiptResults,
    receiptSearch, setReceiptSearch, receiptPickerOpen, setReceiptPickerOpen,
    calcOpen, setCalcOpen, computedExpiration, shelfLifeWarning, calcRows,
    procedureText, summaryText, copy, up, pickSuggestion, linkReceipt, clearReceipt,
    markOverridden, addTargetRows, updateTarget, removeTarget, pasteTargets,
    addStep, removeStep, updateStep, discardDraft, setExpirationCode,
  };
}

export type UsePrepFormReturn = ReturnType<typeof usePrepForm>;