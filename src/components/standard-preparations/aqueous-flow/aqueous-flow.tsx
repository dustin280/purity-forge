import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepSource } from "./step-source";
import { StepDiluent } from "../working-flow/step-diluent";
import { StepConcentration } from "../working-flow/step-concentration";
import { StepReview } from "./step-review";
import { VerifyPrintDialog } from "../solid-flow/verify-print-dialog";
import { emptyAqueousState, type AqueousFlowState } from "./types";
import { toMgPerMl } from "../solid-flow/types";
import { computeDilution } from "@/lib/sample-prep/dilution";
import { createAqueousPrimary } from "@/lib/standard-preparations/prep-aqueous.functions";
import { exportPrepPdf } from "@/lib/standard-preparation-pdf";
import { EXP_PRESETS, periodDays } from "@/components/standard-preparations/prep-form-logic";

const STEP_TITLES = ["Source", "Diluent", "Concentration", "Review"];
const MIN_PIPETTE_UL = 10;

interface Props {
  defaultAnalystName: string;
  userToken: string;
}

export function AqueousFlow({ defaultAnalystName, userToken }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<AqueousFlowState>(() => emptyAqueousState());
  const preparedAt = useMemo(() => new Date().toISOString(), []);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const create = useServerFn(createAqueousPrimary);
  const mut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create({ data: payload as any }) as Promise<{ id: string; log_number: string }>,
    onSuccess: (res) => {
      setSavedNumber(res.log_number);
      setSavedId(res.id);
      toast.success(`Saved ${res.log_number}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stockMgPerMl = state.source?.stock_concentration_mg_per_ml ?? null;
  const targetMgPerMl = state.concentration.final_concentration
    ? toMgPerMl(Number(state.concentration.final_concentration), state.concentration.final_concentration_unit)
    : null;

  const dilutionResult = useMemo(() => {
    if (!state.source || stockMgPerMl == null || state.source.available_volume_ml == null || targetMgPerMl == null) return null;
    const v2 = Number(state.concentration.final_volume_ml);
    if (!Number.isFinite(v2) || v2 <= 0 || !Number.isFinite(targetMgPerMl) || targetMgPerMl <= 0) return null;
    return computeDilution({
      stock: { conc: stockMgPerMl, massUnit: "mg", volUnit: "mL", availableVol: state.source.available_volume_ml, availableVolUnit: "mL" },
      target: { conc: targetMgPerMl, massUnit: "mg", volUnit: "mL", finalVol: v2, finalVolUnit: "mL" },
      diluentName: state.diluentName.trim() || "Diluent",
      minPipetteUl: MIN_PIPETTE_UL,
    });
  }, [state.source, stockMgPerMl, targetMgPerMl, state.concentration.final_volume_ml, state.diluentName]);

  const canNext = (() => {
    if (step === 0) return !!state.source && state.source.stock_concentration_mg_per_ml != null && state.source.available_volume_ml != null;
    if (step === 1) return !!state.diluentName.trim();
    if (step === 2) return !!dilutionResult && !dilutionResult.error && !!state.concentration.standard_name.trim();
    return false;
  })();

  function handleVerify() {
    if (!state.source || !dilutionResult || dilutionResult.error || stockMgPerMl == null || targetMgPerMl == null) return;
    const days = periodDays(state.concentration.expiration_period_code, state.concentration.expiration_period_days);

    const payload = {
      prepared_at: preparedAt,
      analyst_name: defaultAnalystName,
      user_token: userToken,
      material_receipt_id: state.source.id,
      ref_material_name: state.source.material_name,
      ref_lot: state.source.internal_lot || state.source.manufacturer_lot || null,
      ref_purity_percent: state.source.purity_percent,
      ref_molecular_weight: state.source.molecular_weight,
      ref_receipt_date: state.source.received_at ? state.source.received_at.slice(0, 10) : null,
      stock_concentration_mg_per_ml: stockMgPerMl,
      diluent_name: state.diluentName.trim(),
      diluent_lot: state.diluentLot || null,
      standard_name: state.concentration.standard_name.trim(),
      final_concentration_value: Number(state.concentration.final_concentration),
      final_concentration_unit: state.concentration.final_concentration_unit,
      final_volume_ml: Number(state.concentration.final_volume_ml),
      target_concentration_mg_per_ml: targetMgPerMl,
      expiration_period_code: state.concentration.expiration_period_code,
      expiration_period_days: days,
      storage_condition: state.concentration.storage_condition || null,
      storage_location: state.concentration.storage_location || null,
      notes: state.concentration.notes || null,
      preparation_instructions: dilutionResult.procedure,
    };
    mut.mutate(payload);
  }

  function handleSavePdf() {
    if (!state.source || !dilutionResult || dilutionResult.error || stockMgPerMl == null) return;
    const days = state.concentration.expiration_period_code === "custom"
      ? Number(state.concentration.expiration_period_days) || 0
      : EXP_PRESETS[state.concentration.expiration_period_code].days;
    const expDate = new Date(preparedAt);
    expDate.setDate(expDate.getDate() + days);

    const row = {
      id: savedId ?? "",
      log_number: savedNumber ?? "",
      batch_group_id: null,
      prepared_at: preparedAt,
      analyst_id: null,
      analyst_name: defaultAnalystName,
      standard_name: state.concentration.standard_name,
      material_receipt_id: state.source.id,
      manufacturer_lot: state.source.internal_lot || state.source.manufacturer_lot,
      target_concentration: `${state.concentration.final_concentration} ${state.concentration.final_concentration_unit}`,
      final_volume: `${state.concentration.final_volume_ml} mL`,
      solvent: state.diluentName,
      preparation_steps: [],
      mixing_details: null,
      appearance_notes: dilutionResult.procedure,
      expiration_date: expDate.toISOString().slice(0, 10),
      storage_condition: state.concentration.storage_condition,
      storage_location: state.concentration.storage_location,
      container_label: savedNumber,
      prep_type: "primary_aqueous",
      status: "approved" as const,
      reviewer_id: null, reviewer_name: defaultAnalystName, reviewed_at: new Date().toISOString(),
      approver_id: null, approver_name: defaultAnalystName, approved_at: new Date().toISOString(),
      notes: state.concentration.notes,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expiration_period_code: state.concentration.expiration_period_code,
      expiration_period_days: days,
      initial_solvent: null,
      final_diluent: state.diluentName,
      modifier_percent: null,
      material_overridden: false,
      ref_material_name: state.source.material_name,
      ref_lot: state.source.internal_lot || state.source.manufacturer_lot,
      ref_form: "liquid" as const,
      ref_purity_percent: state.source.purity_percent,
      ref_concentration_mg_per_ml: stockMgPerMl,
      ref_molecular_weight: state.source.molecular_weight,
      ref_receipt_date: state.source.received_at,
      final_volume_ml: Number(state.concentration.final_volume_ml),
      volume_remaining_ml: Number(state.concentration.final_volume_ml),
      lifecycle_status: "in_use",
    };
    exportPrepPdf(row, null, 0);
  }

  function handlePrint() {
    window.print();
  }

  function handleExit() {
    if (savedId) navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: savedId } });
    else navigate({ to: "/lab-logs/standard-preparations" });
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 print:hidden">
        {STEP_TITLES.map((t, i) => (
          <div key={t} className="flex items-center gap-2">
            <div className={`size-7 rounded-full text-xs flex items-center justify-center border ${i === step ? "bg-primary text-primary-foreground border-primary" : i < step ? "bg-primary/20 border-primary/40" : "bg-muted"}`}>
              {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
            </div>
            <div className={`text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{t}</div>
            {i < STEP_TITLES.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <StepSource
          source={state.source}
          onChange={s => setState(prev => ({ ...prev, source: s }))}
          defaultReceiverName={defaultAnalystName}
        />
      )}
      {step === 1 && (
        <StepDiluent
          diluentName={state.diluentName}
          diluentLot={state.diluentLot}
          onDiluentName={v => setState(prev => ({ ...prev, diluentName: v }))}
          onDiluentLot={v => setState(prev => ({ ...prev, diluentLot: v }))}
          description="An aqueous primary is a straight dilution of the received stock into one diluent — no percentage mixing."
        />
      )}
      {step === 2 && (
        <StepConcentration
          value={state.concentration}
          onChange={c => setState(prev => ({ ...prev, concentration: c }))}
          dilutionResult={dilutionResult}
          description="Enter the target concentration and final volume — the dilution from the received stock is computed below."
        />
      )}
      {step === 3 && dilutionResult && !dilutionResult.error && state.source && (
        <StepReview ref={reviewRef} state={state} dilutionResult={dilutionResult} preparedAt={preparedAt} analystName={defaultAnalystName} />
      )}
      {step === 3 && (!dilutionResult || dilutionResult.error) && (
        <Card className="p-4 text-sm text-destructive">
          Missing or invalid inputs. Go back and complete all steps.
        </Card>
      )}

      <div className="flex items-center justify-between print:hidden">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext}>
            Next <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={handleVerify} disabled={!dilutionResult || !!dilutionResult.error || mut.isPending || !!savedNumber}>
            {mut.isPending ? "Saving…" : savedNumber ? "Verified ✓" : "Verify & Save"}
          </Button>
        )}
      </div>

      <VerifyPrintDialog
        open={!!savedNumber}
        documentNumber={savedNumber}
        onSavePdf={handleSavePdf}
        onPrint={handlePrint}
        onExit={handleExit}
      />
    </div>
  );
}
