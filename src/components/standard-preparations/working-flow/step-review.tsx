import { forwardRef } from "react";
import { Card } from "@/components/ui/card";
import type { WorkingFlowState } from "./types";
import type { DilutionResult } from "@/lib/sample-prep/dilution";
import { addDaysISO } from "@/components/standard-preparations/prep-form-logic";

interface Props {
  state: WorkingFlowState;
  dilutionResult: DilutionResult;
  preparedAt: string;
  analystName: string;
}

/**
 * Printable review card. Mirrors solid-flow/step-review.tsx, swapping the
 * mass-to-weigh/solvent-split section for the computed dilution steps.
 */
export const StepReview = forwardRef<HTMLDivElement, Props>(function StepReview({ state, dilutionResult, preparedAt, analystName }, ref) {
  const src = state.source!;
  const days = Number(state.concentration.expiration_period_days);
  const computedExpDate = days && preparedAt ? addDaysISO(preparedAt, days) : "";
  const expDate = src.expiration_date && (!computedExpDate || src.expiration_date < computedExpDate)
    ? src.expiration_date
    : computedExpDate;

  return (
    <div ref={ref} className="space-y-4 print:space-y-3">
      <div className="print:hidden">
        <h2 className="text-lg font-semibold">Step 4 — Review</h2>
        <p className="text-sm text-muted-foreground">Verify all values below, then click Verify to save.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between border-b pb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Working Standard Preparation</div>
            <div className="text-xl font-bold">{state.concentration.standard_name}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Prepared: {new Date(preparedAt).toLocaleString()}</div>
            <div>Analyst: {analystName}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Source (Primary Standard)">
            <Row label="Standard" value={src.standard_name} />
            <Row label="Document #" value={src.log_number || "—"} />
            <Row label="Concentration" value={`${src.final_concentration_value} ${src.final_concentration_unit}`} />
            <Row label="Traces to" value={src.ref_material_name || "—"} />
            {src.ref_lot && <Row label="Lot" value={src.ref_lot} />}
          </Section>

          <Section title="Target">
            <Row label="Concentration" value={`${state.concentration.final_concentration} ${state.concentration.final_concentration_unit}`} />
            <Row label="Final volume" value={`${state.concentration.final_volume_ml} mL`} />
            <Row label="Dilution factor" value={`${dilutionResult.dilutionFactor.toFixed(1)}×`} />
            <Row label="Expiration" value={expDate || "—"} />
            <Row label="Storage" value={state.concentration.storage_condition || "—"} />
          </Section>
        </div>

        <Section title="Dilution">
          <ul className="text-sm space-y-1">
            {dilutionResult.steps.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-3 border-b border-dashed py-1">
                <span>
                  <span className="font-medium">{s.fromLabel}</span>{" "}
                  <span className="text-muted-foreground">— {s.aliquotDisplay} into {s.diluentDisplay} {state.diluentName} → {s.finalVolDisplay} at {s.resultConcDisplay}</span>
                </span>
              </li>
            ))}
          </ul>
          {state.diluentLot && (
            <p className="text-xs text-muted-foreground mt-1">Diluent lot: {state.diluentLot}</p>
          )}
        </Section>

        <Section title="Preparation Instructions">
          <pre className="text-xs sm:text-sm whitespace-pre-wrap font-mono leading-relaxed bg-muted/40 p-3 rounded-md">
{dilutionResult.procedure}
          </pre>
        </Section>

        {state.concentration.notes && (
          <Section title="Notes">
            <p className="text-sm whitespace-pre-wrap">{state.concentration.notes}</p>
          </Section>
        )}
      </Card>
    </div>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm border-b border-dashed py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
