import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Json } from "@/integrations/supabase/types";
import { SterilityFields, type SterilityData } from "./sterility-fields";
import { EndotoxinFields, type EndotoxinData } from "./endotoxin-fields";
import { HeavyMetalsFields, type HeavyMetalsData } from "./heavy-metals-fields";
import { NonchromAttachmentsPanel } from "./nonchrom-attachments-panel";
import { placeSampleInIncubator, getTestIncubatorLocation } from "@/lib/lims/storage-assignment.functions";
import {
  listMediaLots, prepAndInoculateSterility, recordInterimCheck, getSterilityPrep,
} from "@/lib/lims/sterility-prep.functions";
import { qk } from "@/lib/query-keys";

type NonPurityType = "sterility" | "endotoxin" | "heavy_metals";

const TYPE_LABEL: Record<NonPurityType, string> = {
  sterility: "Sterility", endotoxin: "Endotoxin", heavy_metals: "Heavy Metals",
};

export type NonchromResultRow = {
  id: string;
  test_id: string;
  test_type: string;
  data: Json;
  analysis_date: string;
  analyst_id: string | null;
};

type SterilitySavedData = SterilityData & { verdict: "pass" | "fail" };

function SavedSummary({ testType, data, analystName, date }: {
  testType: NonPurityType; data: Json; analystName: string | null; date: string;
}) {
  const meta = (
    <p className="text-xs text-muted-foreground mt-2">
      Entered by {analystName ?? "—"} on {new Date(date).toLocaleString()}
    </p>
  );
  if (testType === "sterility") {
    const d = data as unknown as SterilitySavedData;
    const color = d.verdict === "pass" ? "var(--status-success)" : "var(--destructive)";
    return (
      <div>
        <div className="text-2xl font-mono font-bold uppercase" style={{ color }}>{d.verdict}</div>
        <div className="text-xs text-muted-foreground mt-1">
          FTM: {d.ftm_result} · TSB: {d.tsb_result} · Method: {d.method}
        </div>
        {d.notes && <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>}
        {meta}
      </div>
    );
  }
  if (testType === "endotoxin") {
    const d = data as unknown as EndotoxinData & { verdict?: "pass" | "fail" };
    const color = d.verdict === "fail" ? "var(--destructive)" : "var(--status-success)";
    return (
      <div>
        <div className="text-2xl font-mono font-bold" style={{ color }}>
          {d.result_value} {d.unit} <span className="text-sm uppercase">({d.verdict ?? "—"})</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Limit: {d.limit} {d.unit} · Method: {d.method}</div>
        {meta}
      </div>
    );
  }
  const d = data as unknown as HeavyMetalsData;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm font-mono">
        <div>Hg: {d.elements.mercury ?? "—"} {d.unit}</div>
        <div>Pb: {d.elements.lead ?? "—"} {d.unit}</div>
        <div>As: {d.elements.arsenic ?? "—"} {d.unit}</div>
        <div>Cd: {d.elements.cadmium ?? "—"} {d.unit}</div>
      </div>
      {(d.lab_name || d.report_reference) && (
        <div className="text-xs text-muted-foreground mt-1">
          {d.lab_name ?? "—"}{d.report_reference ? ` · Ref: ${d.report_reference}` : ""}
        </div>
      )}
      {meta}
    </div>
  );
}

export function NonchromResultCard({
  test, latest, analystName, onSave, busy,
}: {
  test: { id: string; test_type: string; sub_id: string | null; method_name: string; instrument: string };
  latest: NonchromResultRow | null;
  analystName: string | null;
  onSave: (testType: NonPurityType, data: SterilityData | EndotoxinData | HeavyMetalsData) => void;
  busy: boolean;
}) {
  const testType = test.test_type as NonPurityType;

  return (
    <Card className="p-5 border-border space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{TYPE_LABEL[testType]}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {test.method_name}{test.sub_id ? ` · Vial ${test.sub_id}` : ""}
          </p>
        </div>
      </div>

      {!latest && testType === "sterility" && <SterilityIncubationPanel testId={test.id} />}
      {!latest && testType === "endotoxin" && <IncubatorStatus testId={test.id} />}

      {latest ? (
        <SavedSummary testType={testType} data={latest.data} analystName={analystName} date={latest.analysis_date} />
      ) : testType === "sterility" ? (
        <SterilityFields busy={busy} onSave={d => onSave("sterility", d)} />
      ) : testType === "endotoxin" ? (
        <EndotoxinFields busy={busy} onSave={d => onSave("endotoxin", d)} />
      ) : (
        <HeavyMetalsFields busy={busy} onSave={d => onSave("heavy_metals", d)} />
      )}

      {testType === "heavy_metals" && <NonchromAttachmentsPanel testId={test.id} canEdit />}
    </Card>
  );
}

/** Incubator placement for a test that hasn't been resulted yet (endotoxin
 * only — sterility uses SterilityIncubationPanel below, which places the
 * sample as part of its combined Prep & Inoculate action). Placement is
 * manual; release is automatic the moment a result is saved (see
 * saveNonchromResult in nonchrom-results.functions.ts). */
function IncubatorStatus({ testId }: { testId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTestIncubatorLocation);
  const placeFn = useServerFn(placeSampleInIncubator);

  const { data: loc } = useQuery({
    queryKey: qk.sampleStorage.incubator(testId),
    queryFn: () => getFn({ data: { testId } }),
  });

  const placeMut = useMutation({
    mutationFn: () => placeFn({ data: { testId } }),
    onSuccess: (res) => {
      if (res.ok) { toast.success(`Placed in ${res.location}`); qc.invalidateQueries({ queryKey: qk.sampleStorage.incubator(testId) }); }
      else toast.error(res.reason ?? "No available incubator tray");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loc) {
    return (
      <div className="text-xs rounded border border-border bg-muted/40 px-3 py-2">
        Incubating in <span className="font-mono">{loc.location}</span> since{" "}
        {new Date(loc.assigned_at).toLocaleString()}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={placeMut.isPending} onClick={() => placeMut.mutate()}>
        {placeMut.isPending ? "Placing…" : "Place in Incubator"}
      </Button>
    </div>
  );
}

/** USP <71> direct-inoculation prep + 14-day incubation tracking for a
 * sterility test that hasn't been resulted yet. Prep & Inoculate is one
 * combined action: pick the FTM/TSB lots used, submit, and the sample is
 * both recorded (sterility_preps) and placed in an incubator in the same
 * step (see prepAndInoculateSterility). */
function SterilityIncubationPanel({ testId }: { testId: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getSterilityPrep);
  const mediaLotsFn = useServerFn(listMediaLots);
  const prepFn = useServerFn(prepAndInoculateSterility);
  const checkFn = useServerFn(recordInterimCheck);

  const { data: status } = useQuery({
    queryKey: qk.sterilityPrep.status(testId),
    queryFn: () => statusFn({ data: { testId } }),
  });

  const [showPrepForm, setShowPrepForm] = useState(false);
  const [ftmReceiptId, setFtmReceiptId] = useState<string>("");
  const [tsbReceiptId, setTsbReceiptId] = useState<string>("");
  const [volumeMl, setVolumeMl] = useState("1.0");

  const { data: ftmLots } = useQuery({
    queryKey: qk.sterilityPrep.mediaLots("FTM"),
    queryFn: () => mediaLotsFn({ data: { mediaName: "FTM" } }),
    enabled: showPrepForm,
  });
  const { data: tsbLots } = useQuery({
    queryKey: qk.sterilityPrep.mediaLots("TSB"),
    queryFn: () => mediaLotsFn({ data: { mediaName: "TSB" } }),
    enabled: showPrepForm,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: qk.sterilityPrep.status(testId) });
  }

  const prepMut = useMutation({
    mutationFn: () => prepFn({
      data: {
        testId, ftmReceiptId, tsbReceiptId,
        inoculationVolumeMl: Number(volumeMl) || 1.0,
      },
    }),
    onSuccess: (res) => {
      toast.success(res.placement.ok ? `Inoculated and placed in ${res.placement.location}` : `Inoculated — ${res.placement.reason ?? "no incubator tray available yet"}`);
      setShowPrepForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [checkNotes, setCheckNotes] = useState("");
  const checkMut = useMutation({
    mutationFn: (result: "clear" | "turbid") => checkFn({ data: { testId, result, notes: checkNotes.trim() || null } }),
    onSuccess: () => { toast.success("Interim check recorded"); setCheckNotes(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!status?.prep) {
    if (!showPrepForm) {
      return (
        <Button size="sm" variant="outline" onClick={() => setShowPrepForm(true)}>
          Prep & Inoculate
        </Button>
      );
    }
    return (
      <div className="rounded border border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">FTM lot</label>
            <Select value={ftmReceiptId} onValueChange={setFtmReceiptId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(ftmLots ?? []).length === 0
                  ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No released FTM lots found</div>
                  : ftmLots!.map((l) => (
                      <SelectItem key={l.receiptId} value={l.receiptId}>
                        {l.lotNumber}{l.expiryDate ? ` (exp ${l.expiryDate})` : ""}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">TSB lot</label>
            <Select value={tsbReceiptId} onValueChange={setTsbReceiptId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(tsbLots ?? []).length === 0
                  ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No released TSB lots found</div>
                  : tsbLots!.map((l) => (
                      <SelectItem key={l.receiptId} value={l.receiptId}>
                        {l.lotNumber}{l.expiryDate ? ` (exp ${l.expiryDate})` : ""}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="w-28">
          <label className="text-xs text-muted-foreground">Volume (mL)</label>
          <input
            type="number" step="0.1" min="0.1" value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)}
            className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm" disabled={!ftmReceiptId || !tsbReceiptId || prepMut.isPending}
            onClick={() => prepMut.mutate()}
          >
            {prepMut.isPending ? "Saving…" : "Confirm Prep & Inoculate"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowPrepForm(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  const { prep, dayOfIncubation, interimCheckDue, readoutDue } = status;
  return (
    <div className="rounded border border-border p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">Day {dayOfIncubation} of incubation</div>
        {readoutDue && (
          <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] uppercase font-semibold">
            Ready for readout
          </span>
        )}
      </div>
      <div className="text-muted-foreground">
        Prepared {new Date(prep.prepared_at).toLocaleString()} · FTM lot {prep.ftm_lot_number ?? "—"} · TSB lot {prep.tsb_lot_number ?? "—"} · {prep.inoculation_volume_ml}mL each
      </div>
      {prep.interim_check_status !== "pending" ? (
        <div className="text-muted-foreground">
          Interim check: <span className="font-semibold uppercase">{prep.interim_check_status}</span>
          {prep.interim_check_at ? ` on ${new Date(prep.interim_check_at).toLocaleString()}` : ""}
          {prep.interim_check_notes ? ` — ${prep.interim_check_notes}` : ""}
        </div>
      ) : interimCheckDue ? (
        <div className="space-y-1.5 pt-1 border-t border-border">
          <div className="font-semibold">Mid-incubation check due</div>
          <Textarea rows={1} placeholder="Notes (optional)" value={checkNotes} onChange={(e) => setCheckNotes(e.target.value)} className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={checkMut.isPending} onClick={() => checkMut.mutate("clear")}>Clear</Button>
            <Button size="sm" variant="outline" disabled={checkMut.isPending} onClick={() => checkMut.mutate("turbid")}>Turbid</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
