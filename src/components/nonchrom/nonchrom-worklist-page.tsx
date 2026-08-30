/**
 * Shared worklist page for the three non-HPLC test types.
 *
 * The problem it solves: result entry used to live on the individual sample
 * page, so recording a sterility readout meant already knowing which sample
 * needed one. This inverts it -- pick the test type, see exactly the samples
 * flagged for it, enter the result inline. The list is the worklist.
 *
 * Sterility additionally carries its day-3 / day-7 observations here, because
 * those are part of the same record and are read from the same incubator at
 * the same bench. They previously required the vial to be in an analysis
 * batch, which in practice it almost never was.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  SterilityFields,
  type SterilityData,
} from "@/components/samples/nonchrom/sterility-fields";
import {
  EndotoxinFields,
  type EndotoxinData,
} from "@/components/samples/nonchrom/endotoxin-fields";
import {
  HeavyMetalsFields,
  type HeavyMetalsData,
} from "@/components/samples/nonchrom/heavy-metals-fields";
import { saveNonchromResult } from "@/lib/lims/nonchrom-results.functions";
import {
  listNonchromWorklist,
  recordSterilityObservation,
  type NonchromWorklistRow,
  type NonPurityTestType,
} from "@/lib/lims/nonchrom-worklist.functions";
import { qk } from "@/lib/query-keys";

const TITLE: Record<NonPurityTestType, string> = {
  sterility: "Sterility",
  endotoxin: "Endotoxin",
  heavy_metals: "Heavy Metals",
};
const BLURB: Record<NonPurityTestType, string> = {
  sterility:
    "Samples flagged for sterility. Record the day-3 and day-7 looks as you take them, then the final readout — turbidity in either tube fails the sample.",
  endotoxin:
    "Samples flagged for endotoxin. Assay sensitivity is stamped from the lab-wide setting at save time.",
  heavy_metals:
    "Samples flagged for heavy metals. Outsourced — transcribe the external lab's reviewed result and attach their report on the sample.",
};

function CheckpointControl({
  row,
  checkpoint,
  onDone,
}: {
  row: NonchromWorklistRow;
  checkpoint: "day3" | "day7";
  onDone: () => void;
}) {
  const recordFn = useServerFn(recordSterilityObservation);
  const existing = row.observations.find((o) => o.checkpoint === checkpoint);
  const [notes, setNotes] = useState("");
  const mut = useMutation({
    mutationFn: (status: "clear" | "turbid") =>
      recordFn({ data: { testId: row.test_id, checkpoint, status, notes: notes || null } }),
    onSuccess: () => {
      toast.success(`${checkpoint === "day3" ? "Day 3" : "Day 7"} observation recorded`);
      setNotes("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const label = checkpoint === "day3" ? "Day 3" : "Day 7";

  if (existing) {
    return (
      <div className="flex items-start gap-2 text-xs">
        <Badge variant="outline" className="shrink-0">
          {label}
        </Badge>
        <div>
          <span
            className={
              existing.status === "turbid"
                ? "text-destructive font-semibold"
                : "text-emerald-600 dark:text-emerald-400 font-semibold"
            }
          >
            {existing.status}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {new Date(existing.observed_at).toLocaleDateString()}
            {existing.observed_by_name ? ` · ${existing.observed_by_name}` : ""}
          </span>
          {existing.notes && <div className="text-muted-foreground mt-0.5">{existing.notes}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="shrink-0 text-xs">
        {label}
      </Badge>
      <Input
        className="h-7 text-xs max-w-[220px]"
        placeholder="notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={mut.isPending}
        onClick={() => mut.mutate("clear")}
      >
        Clear
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={mut.isPending}
        onClick={() => mut.mutate("turbid")}
      >
        Turbid
      </Button>
    </div>
  );
}

export function NonchromWorklistPage({ testType }: { testType: NonPurityTestType }) {
  const listFn = useServerFn(listNonchromWorklist);
  const saveFn = useServerFn(saveNonchromResult);
  const qc = useQueryClient();
  const [openTestId, setOpenTestId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const key = qk.nonchromWorklist.list(testType);
  const { data: rows, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { test_type: testType } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: (vars: { testId: string; data: SterilityData | EndotoxinData | HeavyMetalsData }) =>
      saveFn({ data: { test_type: testType, testId: vars.testId, data: vars.data } as never }),
    onSuccess: () => {
      toast.success("Result recorded");
      setOpenTestId(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = rows ?? [];
  const pending = all.filter((r) => !r.result_id);
  const done = all.filter((r) => r.result_id);
  const visible = showDone ? all : pending;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Non-HPLC Analysis Results
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{TITLE[testType]}</h1>
        <p className="text-sm text-muted-foreground mt-1">{BLURB[testType]}</p>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary">{pending.length} awaiting result</Badge>
        {done.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? "Hide" : "Show"} {done.length} completed
          </Button>
        )}
      </div>

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}

      {!isLoading && visible.length === 0 && (
        <Card className="p-8 text-center">
          <FlaskConical className="size-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-3">
            No samples are flagged for {TITLE[testType].toLowerCase()} right now.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Tests are provisioned at Sample Receipt from the requested test parameters.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {visible.map((row) => {
          const isOpen = openTestId === row.test_id;
          return (
            <Card key={row.test_id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/samples/$batchId"
                      params={{ batchId: row.batch_id }}
                      className="font-mono font-semibold hover:underline"
                    >
                      {row.batch_id}
                    </Link>
                    {row.result_id && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 gap-1">
                        <CheckCircle2 className="size-3" /> recorded
                      </Badge>
                    )}
                    {row.incubation_day != null && !row.result_id && (
                      <Badge variant="outline" className="text-xs">
                        day {row.incubation_day} of incubation
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5 truncate">
                    {row.compound ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.client ?? "—"}
                    {row.lot ? ` · lot ${row.lot}` : ""}
                    {row.due_date ? ` · due ${row.due_date}` : ""}
                  </div>
                  {row.result_summary && (
                    <div className="text-xs font-mono mt-1.5">{row.result_summary}</div>
                  )}
                </div>
                {!row.result_id && (
                  <Button
                    size="sm"
                    variant={isOpen ? "secondary" : "default"}
                    onClick={() => setOpenTestId(isOpen ? null : row.test_id)}
                  >
                    {isOpen ? "Close" : "Enter result"}
                    {!isOpen && <ChevronRight className="size-4 ml-1" />}
                  </Button>
                )}
              </div>

              {testType === "sterility" && !row.result_id && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Incubation checks
                  </div>
                  <CheckpointControl row={row} checkpoint="day3" onDone={refresh} />
                  <CheckpointControl row={row} checkpoint="day7" onDone={refresh} />
                </div>
              )}

              {isOpen && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    {testType === "sterility" ? "Final readout" : "Result"}
                  </div>
                  {testType === "sterility" && (
                    <SterilityFields
                      busy={save.isPending}
                      onSave={(d) => save.mutate({ testId: row.test_id, data: d })}
                    />
                  )}
                  {testType === "endotoxin" && (
                    <EndotoxinFields
                      busy={save.isPending}
                      onSave={(d) => save.mutate({ testId: row.test_id, data: d })}
                    />
                  )}
                  {testType === "heavy_metals" && (
                    <HeavyMetalsFields
                      busy={save.isPending}
                      onSave={(d) => save.mutate({ testId: row.test_id, data: d })}
                    />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
