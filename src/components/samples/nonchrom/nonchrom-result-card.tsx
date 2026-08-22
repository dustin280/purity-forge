import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";
import { SterilityFields, type SterilityData } from "./sterility-fields";
import { EndotoxinFields, type EndotoxinData } from "./endotoxin-fields";
import { HeavyMetalsFields, type HeavyMetalsData } from "./heavy-metals-fields";
import { NonchromAttachmentsPanel } from "./nonchrom-attachments-panel";
import { placeSampleInIncubator, getTestIncubatorLocation } from "@/lib/lims/storage-assignment.functions";
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

function SavedSummary({ testType, data, analystName, date }: {
  testType: NonPurityType; data: Json; analystName: string | null; date: string;
}) {
  const meta = (
    <p className="text-xs text-muted-foreground mt-2">
      Entered by {analystName ?? "—"} on {new Date(date).toLocaleString()}
    </p>
  );
  if (testType === "sterility") {
    const d = data as unknown as SterilityData;
    const color = d.verdict === "pass" ? "var(--status-success)" : d.verdict === "fail" ? "var(--destructive)" : "var(--status-warning)";
    return (
      <div>
        <div className="text-2xl font-mono font-bold uppercase" style={{ color }}>{d.verdict}</div>
        <div className="text-xs text-muted-foreground mt-1">Method: {d.method}{d.media ? ` · Media: ${d.media}` : ""}</div>
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

      {!latest && (testType === "sterility" || testType === "endotoxin") && (
        <IncubatorStatus testId={test.id} />
      )}

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

/** Incubator placement for a sterility/endotoxin test that hasn't been
 * resulted yet. Placement is manual (a physical event happening at the
 * bench); release is automatic the moment a result is saved (see
 * saveNonchromResult in nonchrom-results.functions.ts) — no separate
 * "remove from incubator" click needed. */
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
