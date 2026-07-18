import { forwardRef } from "react";
import { Card } from "@/components/ui/card";
import type { SolidFlowState } from "./types";
import type { ComputedPrep } from "./instructions";
import { addDaysISO } from "@/components/standard-preparations/prep-form-logic";

interface Props {
  state: SolidFlowState;
  computed: ComputedPrep;
  preparedAt: string;
  analystName: string;
}

/**
 * Printable review card. Forwarded ref exposes the outer div so window.print()
 * can be triggered against a container of a known shape.
 */
export const StepReview = forwardRef<HTMLDivElement, Props>(function StepReview({ state, computed, preparedAt, analystName }, ref) {
  const src = state.source!;
  const days = Number(state.concentration.expiration_period_days);
  const expDate = days && preparedAt ? addDaysISO(preparedAt, days) : "";

  return (
    <div ref={ref} className="space-y-4 print:space-y-3">
      <div className="print:hidden">
        <h2 className="text-lg font-semibold">Step 4 — Review</h2>
        <p className="text-sm text-muted-foreground">Verify all values below, then click Verify to save.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between border-b pb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Standard Preparation</div>
            <div className="text-xl font-bold">{state.concentration.standard_name}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Prepared: {new Date(preparedAt).toLocaleString()}</div>
            <div>Analyst: {analystName}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Source">
            <Row label="Material" value={src.material_name} />
            <Row label="Lot" value={src.lot || "—"} />
            <Row label="Manufacturer" value={src.manufacturer || "—"} />
            <Row label="Purity" value={src.purity_percent != null ? `${src.purity_percent}%` : "—"} />
            {src.molecular_weight != null && <Row label="MW" value={String(src.molecular_weight)} />}
          </Section>

          <Section title="Target">
            <Row label="Concentration" value={`${state.concentration.final_concentration} ${state.concentration.final_concentration_unit}`} />
            <Row label="Final volume" value={`${state.concentration.final_volume_ml} mL`} />
            <Row label="Mass to weigh" value={`${computed.mass_mg.toFixed(3)} mg`} />
            <Row label="Expiration" value={expDate || "—"} />
            <Row label="Storage" value={state.concentration.storage_condition || "—"} />
          </Section>
        </div>

        <Section title="Diluent">
          <ul className="text-sm space-y-1">
            {computed.solvent_ml.map((s, i) => {
              const meta = state.diluent[i];
              return (
                <li key={i} className="flex items-start justify-between gap-3 border-b border-dashed py-1">
                  <span>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted-foreground">— {s.ml.toFixed(2)} mL ({meta?.percent}%)</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {meta?.lot ? `Lot ${meta.lot}` : ""}
                    {meta?.manufacturer ? ` · ${meta.manufacturer}` : ""}
                    {meta?.expiry_date ? ` · exp ${meta.expiry_date}` : ""}
                  </span>
                </li>
              );
            })}
            {computed.modifier_ml != null && (
              <li className="flex items-start justify-between gap-3 py-1">
                <span>
                  <span className="font-medium">{state.modifier.type}</span>{" "}
                  <span className="text-muted-foreground">— {computed.modifier_ml < 1 ? `${(computed.modifier_ml * 1000).toFixed(1)} µL` : `${computed.modifier_ml.toFixed(2)} mL`} ({state.modifier.percent}%)</span>
                </span>
              </li>
            )}
          </ul>
        </Section>

        <Section title="Preparation Instructions">
          <pre className="text-xs sm:text-sm whitespace-pre-wrap font-mono leading-relaxed bg-muted/40 p-3 rounded-md">
{computed.instructions}
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
