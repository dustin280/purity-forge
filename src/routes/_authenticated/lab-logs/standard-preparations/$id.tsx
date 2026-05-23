import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteStandardPreparation,
  getStandardPreparation,
  transitionStandardPreparation,
  updateStandardPreparation,
} from "@/lib/standard-preparations.functions";
import { PrepForm, prepValuesToPayload, clearPrepDraft, type PrepFormValues } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { TraceabilitySnapshot } from "@/components/standard-preparations/traceability-snapshot";
import { TargetsTable } from "@/components/standard-preparations/targets-table";
import { PrepAttachments } from "@/components/standard-preparations/prep-attachments";
import { PrepDetailHeader } from "@/components/standard-preparations/detail-header";
import { PrepDetailInfoCards } from "@/components/standard-preparations/detail-info-cards";
import { PrepStepsCard } from "@/components/standard-preparations/steps-card";
import { PrepReviewCard } from "@/components/standard-preparations/review-card";
import { exportPrepPdf, type LinkedReceipt } from "@/lib/standard-preparation-pdf";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/$id")({
  component: PrepDetail,
});

function PrepDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile, role } = useAuth();
  const get = useServerFn(getStandardPreparation);
  const update = useServerFn(updateStandardPreparation);
  const del = useServerFn(deleteStandardPreparation);
  const transition = useServerFn(transitionStandardPreparation);

  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.standardPreps.detail(id),
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: (patch: ReturnType<typeof prepValuesToPayload>) => update({ data: { id, patch } }),
    onSuccess: () => {
      clearPrepDraft(`sop-draft:edit:${id}`);
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
      qc.invalidateQueries({ queryKey: qk.standardPreps.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Preparation deleted");
      navigate({ to: "/lab-logs/standard-preparations" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMut = useMutation({
    mutationFn: (args: { target: "reviewed" | "approved" | "draft"; actor_name: string }) =>
      transition({ data: { id, ...args } }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-sm text-destructive">Preparation not found.</div>;

  const r = data.log;
  const linked: LinkedReceipt = r.material_receipt ?? null;
  const canEdit = role === "admin" || role === "tech" || role === "reviewer";
  const canReview = role === "admin" || role === "reviewer";
  const actorName = profileDisplayName(profile, user?.email) || user?.email || "";

  if (editing) {
    const initial: Partial<PrepFormValues> = {
      prepared_at: r.prepared_at.slice(0, 16),
      analyst_name: r.analyst_name,
      standard_name: r.standard_name,
      material_receipt_id: r.material_receipt_id ?? "",
      material_receipt_label: linked
        ? `${linked.receipt_number} — ${linked.material_name}${linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}`
        : "",
      manufacturer_lot: r.manufacturer_lot ?? "",
      target_concentration: r.target_concentration ?? "",
      final_volume: r.final_volume ?? "",
      solvent: r.solvent ?? "",
      preparation_steps: r.preparation_steps?.length
        ? r.preparation_steps
        : [{ step_no: 1, description: "", amount: "", instrument_id: "", time: "" }],
      mixing_details: r.mixing_details ?? "",
      appearance_notes: r.appearance_notes ?? "",
      expiration_date: r.expiration_date ?? "",
      storage_condition: r.storage_condition ?? "",
      storage_location: r.storage_location ?? "",
      container_label: r.container_label ?? "",
      notes: r.notes ?? "",
    };
    return (
      <div className="p-6 md:p-8 max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Edit {r.log_number}</h1>
        <PrepForm
          initial={initial}
          defaultAnalystName={r.analyst_name}
          submitting={updateMut.isPending}
          submitLabel="Save Changes"
          draftKey={`sop-draft:edit:${id}`}
          onSubmit={v => updateMut.mutate(prepValuesToPayload(v))}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PrepDetailHeader
        row={r}
        canEdit={canEdit}
        canReview={canReview}
        isAdmin={role === "admin"}
        actorName={actorName}
        transitionLoading={transitionMut.isPending}
        onEdit={() => setEditing(true)}
        onExportPdf={() => exportPrepPdf(r, linked, data.attachments.length)}
        onTransition={(target, name) => transitionMut.mutate({ target, actor_name: name })}
        onDelete={() => deleteMut.mutate()}
      />
      <PrepDetailInfoCards row={r} linked={linked} />
      <PrepStepsCard steps={r.preparation_steps ?? []} mixingDetails={r.mixing_details} />
      <PrepReviewCard row={r} />
      <TraceabilitySnapshot row={r} />
      <TargetsTable targets={data.targets} />

      <PrepAttachments logId={id} attachments={data.attachments} canEdit={canEdit && r.status !== "approved"} />
    </div>
  );
}

