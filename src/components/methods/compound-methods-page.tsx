/**
 * Methods -- per-compound method notes (acquisition/processing method,
 * gradient, temp, injection volume, special handling, notes), with a
 * confirm-to-version history. Deliberately not wired into anything else
 * yet (compounds.acquisition_method/processing_method, the columns
 * run-list generation actually reads, are untouched) -- see
 * compound-methods.functions.ts for why.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCompounds } from "@/lib/compounds.functions";
import { listOpenLabMethods } from "@/lib/openlab.functions";
import {
  getCompoundMethodState, saveCompoundMethodDraft, confirmCompoundMethod,
  type CompoundMethodVersion,
} from "@/lib/methods/compound-methods.functions";
import { qk } from "@/lib/query-keys";

interface FieldsState {
  acquisition_method: string | null;
  processing_method: string | null;
  gradient: string | null;
  column_temperature_c: number | null;
  injection_volume_ul: number | null;
  special_handling: string | null;
  notes: string | null;
}

const EMPTY_FIELDS: FieldsState = {
  acquisition_method: null, processing_method: null, gradient: null,
  column_temperature_c: null, injection_volume_ul: null, special_handling: null, notes: null,
};

function fieldsFromVersion(v: CompoundMethodVersion | null): FieldsState {
  if (!v) return EMPTY_FIELDS;
  return {
    acquisition_method: v.acquisition_method, processing_method: v.processing_method, gradient: v.gradient,
    column_temperature_c: v.column_temperature_c, injection_volume_ul: v.injection_volume_ul,
    special_handling: v.special_handling, notes: v.notes,
  };
}

export function CompoundMethodsPage() {
  const { profile } = useAuth();
  const analystName = profileDisplayName(profile, null);
  const queryClient = useQueryClient();

  const listCompoundsFn = useServerFn(listCompounds);
  const listMethodsFn = useServerFn(listOpenLabMethods);
  const getStateFn = useServerFn(getCompoundMethodState);
  const saveDraftFn = useServerFn(saveCompoundMethodDraft);
  const confirmFn = useServerFn(confirmCompoundMethod);

  const { data: compounds = [] } = useQuery({ queryKey: qk.compounds.list(), queryFn: () => listCompoundsFn() });
  const { data: driveMethods = [] } = useQuery({
    queryKey: ["openlab-methods", "all"],
    queryFn: () => listMethodsFn({ data: {} }),
  });
  const amxOptions = useMemo(() => driveMethods.filter(m => m.name.toLowerCase().endsWith(".amx")), [driveMethods]);
  const pmxOptions = useMemo(() => driveMethods.filter(m => m.name.toLowerCase().endsWith(".pmx")), [driveMethods]);

  const [compoundId, setCompoundId] = useState("");
  const stateQ = useQuery({
    queryKey: qk.compoundMethods.state(compoundId),
    queryFn: () => getStateFn({ data: { compound_id: compoundId } }),
    enabled: !!compoundId,
  });

  const [draftId, setDraftId] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldsState>(EMPTY_FIELDS);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // A fresh compound's data replaces the form outright; nothing here is
  // meant to merge with whatever the previous compound had on screen.
  useEffect(() => {
    if (!stateQ.data) { setDraftId(null); setFields(EMPTY_FIELDS); return; }
    setDraftId(stateQ.data.draft?.id ?? null);
    setFields(fieldsFromVersion(stateQ.data.draft));
    setExpandedHistoryId(null);
  }, [stateQ.data]);

  const saveMut = useMutation({
    mutationFn: async (next: FieldsState) => saveDraftFn({
      data: { compound_id: compoundId, draft_id: draftId, analyst_name: analystName, fields: next },
    }),
    onSuccess: (row) => {
      setDraftId(row.id);
      queryClient.setQueryData(qk.compoundMethods.state(compoundId), (prev: typeof stateQ.data) =>
        prev ? { ...prev, draft: row } : prev);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function commitField<K extends keyof FieldsState>(key: K, value: FieldsState[K]) {
    const next = { ...fields, [key]: value };
    setFields(next);
    saveMut.mutate(next);
  }

  const confirmMut = useMutation({
    mutationFn: async () => {
      // Flush whatever's currently in the form first -- a value still
      // sitting in a focused field (about to blur-save) must not be lost
      // to a version that's about to be frozen.
      const saved = await saveDraftFn({
        data: { compound_id: compoundId, draft_id: draftId, analyst_name: analystName, fields },
      });
      return confirmFn({ data: { draft_id: saved.id, analyst_name: analystName } });
    },
    onSuccess: ({ confirmed, draft }) => {
      setDraftId(draft.id);
      setFields(fieldsFromVersion(draft));
      queryClient.setQueryData(qk.compoundMethods.state(compoundId), (prev: typeof stateQ.data) =>
        prev ? { draft, history: [confirmed, ...prev.history] } : prev);
      toast.success("Confirmed as the current working version");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const compound = compounds.find(c => c.id === compoundId);
  const history = stateQ.data?.history ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Methods</h1>
        <p className="text-sm text-muted-foreground">
          Per-compound method notes -- acquisition/processing method, gradient, temperature, injection volume,
          special handling. Every edit saves automatically. Nothing here feeds a run list or a calibration yet --
          it's just a place to record what's actually being done so it isn't lost. Hit "Confirm Current Method"
          to freeze a version and start the next one.
        </p>
      </div>

      <Card className="p-4 space-y-1">
        <Label className="text-xs">Compound</Label>
        <Select value={compoundId} onValueChange={setCompoundId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select a compound..." /></SelectTrigger>
          <SelectContent>
            {compounds.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_blend ? " (blend)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {compoundId && stateQ.isPending && (
        <div className="text-sm text-muted-foreground px-1">Loading...</div>
      )}

      {compoundId && stateQ.data && (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{compound?.name ?? "Current working version"}</div>
              {draftId && (
                <span className="text-[11px] text-muted-foreground">
                  {saveMut.isPending ? "Saving..." : "Saved"}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Acquisition Method</Label>
                <Select value={fields.acquisition_method ?? ""} onValueChange={v => commitField("acquisition_method", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a .amx file..." /></SelectTrigger>
                  <SelectContent>
                    {amxOptions.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                    {amxOptions.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No .amx files synced yet -- see Instrument Comm.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Processing Method</Label>
                <Select value={fields.processing_method ?? ""} onValueChange={v => commitField("processing_method", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a .pmx file..." /></SelectTrigger>
                  <SelectContent>
                    {pmxOptions.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                    {pmxOptions.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No .pmx files synced yet -- see Instrument Comm.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Column Temp (°C)</Label>
                <Input
                  className="h-9" type="number" step="0.1"
                  defaultValue={fields.column_temperature_c ?? ""}
                  onBlur={e => commitField("column_temperature_c", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Injection Volume (µL)</Label>
                <Input
                  className="h-9" type="number" step="0.1"
                  defaultValue={fields.injection_volume_ul ?? ""}
                  onBlur={e => commitField("injection_volume_ul", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Gradient</Label>
              <Textarea
                rows={3} defaultValue={fields.gradient ?? ""} placeholder="e.g. 5-95% B over 12 min, hold 2 min..."
                onBlur={e => commitField("gradient", e.target.value || null)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Special Handling</Label>
              <Textarea
                rows={2} defaultValue={fields.special_handling ?? ""}
                placeholder="Anything about prep, storage, or run conditions this compound needs..."
                onBlur={e => commitField("special_handling", e.target.value || null)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3} defaultValue={fields.notes ?? ""}
                onBlur={e => commitField("notes", e.target.value || null)}
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
                {confirmMut.isPending ? "Confirming..." : "Confirm Current Method"}
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <button
              className="flex items-center gap-2 text-sm font-medium w-full"
              onClick={() => setHistoryOpen(o => !o)}
            >
              {historyOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <History className="size-4" />
              History
              <span className="text-muted-foreground font-normal">
                ({history.length} confirmed version{history.length === 1 ? "" : "s"})
              </span>
            </button>
            {historyOpen && (
              history.length === 0 ? (
                <div className="text-xs text-muted-foreground pl-6">No confirmed versions yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {history.map((v, i) => {
                    const expanded = expandedHistoryId === v.id;
                    return (
                      <div key={v.id} className="border rounded-md">
                        <button
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                          onClick={() => setExpandedHistoryId(expanded ? null : v.id)}
                        >
                          <span className="flex items-center gap-2">
                            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            {i === 0 && (
                              <span className="text-[10px] rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-px font-medium">
                                CURRENT
                              </span>
                            )}
                            <span className="font-medium">{new Date(v.confirmed_at!).toLocaleString()}</span>
                          </span>
                          <span className="text-muted-foreground">{v.confirmed_by_name}</span>
                        </button>
                        {expanded && (
                          <div className="px-3 pb-3 space-y-1.5 text-xs">
                            <HistoryField label="Acquisition Method" value={v.acquisition_method} />
                            <HistoryField label="Processing Method" value={v.processing_method} />
                            <HistoryField label="Column Temp" value={v.column_temperature_c != null ? `${v.column_temperature_c} °C` : null} />
                            <HistoryField label="Injection Volume" value={v.injection_volume_ul != null ? `${v.injection_volume_ul} µL` : null} />
                            <HistoryField label="Gradient" value={v.gradient} multiline />
                            <HistoryField label="Special Handling" value={v.special_handling} multiline />
                            <HistoryField label="Notes" value={v.notes} multiline />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function HistoryField({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={multiline ? "whitespace-pre-wrap" : ""}>{value}</span>
    </div>
  );
}
