import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createStandardPreparationBatch } from "@/lib/standard-preparations.functions";
import { PrepForm, clearPrepDraft, type PrepFormValues } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { analystInitials, synDatePart } from "@/lib/lims-utils";
import { Button } from "@/components/ui/button";

function calcMassMg(conc: number, vol: number, purityPct: number | null): number {
  const raw = conc * vol;
  if (!purityPct || purityPct <= 0) return raw;
  return raw / (purityPct / 100);
}

function periodDays(code: string, customDays: string): number | null {
  const PRESETS: Record<string, number> = { "1w": 7, "2w": 14, "4w": 28, "3m": 90, "6m": 180 };
  if (code === "custom") {
    const n = Number(customDays);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return PRESETS[code] ?? null;
}

function valuesToBatchPayload(v: PrepFormValues, userToken: string) {
  const purity = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  const targets = v.targets
    .filter(t => t.name.trim() || t.target_concentration_mg_per_ml || t.target_volume_ml)
    .map(t => {
      const conc = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
      const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
      const mass = conc != null && vol != null ? calcMassMg(conc, vol, purity) : null;
      return {
        name: t.name,
        target_concentration_mg_per_ml: conc,
        target_volume_ml: vol,
        calculated_mass_mg: mass,
        notes: t.notes ?? "",
      };
    });
  return {
    prepared_at: new Date(v.prepared_at).toISOString(),
    analyst_name: v.analyst_name,
    user_token: userToken,
    batch_label: v.standard_name || null,
    material_receipt_id: v.material_receipt_id || null,
    manufacturer_lot: v.manufacturer_lot || null,
    solvent: v.solvent || null,
    preparation_steps: v.preparation_steps
      .filter(s => s.description.trim() || s.amount.trim() || s.instrument_id.trim() || s.time.trim())
      .map((s, idx) => ({ ...s, step_no: idx + 1 })),
    mixing_details: v.mixing_details || null,
    appearance_notes: v.appearance_notes || null,
    storage_condition: v.storage_condition || null,
    storage_location: v.storage_location || null,
    notes: v.notes || null,
    expiration_period_code: v.expiration_period_code || null,
    expiration_period_days: days,
    initial_solvent: v.initial_solvent || null,
    final_diluent: v.final_diluent || null,
    modifier_percent: v.modifier_percent === "" ? null : Number(v.modifier_percent),
    material_overridden: v.material_overridden,
    ref_material_name: v.ref_material_name || null,
    ref_lot: v.ref_lot || null,
    ref_purity_percent: purity,
    ref_molecular_weight: v.ref_molecular_weight === "" ? null : Number(v.ref_molecular_weight),
    ref_receipt_date: v.ref_receipt_date || null,
    targets,
  };
}

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/new")({
  component: NewPrep,
});

function NewPrep() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const defaultAnalystName = profileDisplayName(profile, null);
  const userToken = analystInitials(profile, user?.email ?? null);
  const synPreviewPrefix = `SYN_${synDatePart(new Date())}_${userToken}_`;
  const createBatch = useServerFn(createStandardPreparationBatch);

  const DRAFT_KEY = "sop-draft:new";
  const mut = useMutation({
    mutationFn: (payload: ReturnType<typeof valuesToBatchPayload>) => createBatch({ data: payload }),
    onSuccess: res => {
      clearPrepDraft(DRAFT_KEY);
      toast.success(`Saved ${res.rows.length} standard${res.rows.length === 1 ? "" : "s"} to log`);
      navigate({ to: "/lab-logs/standard-preparations/batch/$groupId", params: { groupId: res.batch_group_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <h1 className="text-3xl font-bold tracking-tight mb-1">New Standard Preparation</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Each row in the calculator becomes its own journal line. A unique SYN ID (<span className="font-mono">{synPreviewPrefix}n</span>) is assigned per standard on save; the per-day counter is shared across all analysts.
      </p>
      <PrepForm
        defaultAnalystName={defaultAnalystName}
        submitting={mut.isPending}
        submitLabel="Create Preparation"
        draftKey={DRAFT_KEY}
        batchMode
        synPreviewPrefix={synPreviewPrefix}
        onSubmit={v => mut.mutate(valuesToBatchPayload(v, userToken))}
        onCancel={() => navigate({ to: "/lab-logs/standard-preparations" })}
      />
    </div>
  );
}