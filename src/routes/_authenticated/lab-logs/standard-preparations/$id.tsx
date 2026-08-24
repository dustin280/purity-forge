import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PrepForm, prepValuesToPayload } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { TraceabilitySnapshot } from "@/components/standard-preparations/traceability-snapshot";
import { TargetsTable } from "@/components/standard-preparations/targets-table";
import { PrepAttachments } from "@/components/standard-preparations/prep-attachments";
import { PrepDetailHeader } from "@/components/standard-preparations/detail-header";
import { PrepDetailInfoCards } from "@/components/standard-preparations/detail-info-cards";
import { PrepStepsCard } from "@/components/standard-preparations/steps-card";
import { PrepReviewCard } from "@/components/standard-preparations/review-card";
import { PrepLifecycleCard } from "@/components/standard-preparations/prep-lifecycle-card";
import { SequenceUsageCard } from "@/components/standard-preparations/sequence-usage-card";
import { exportPrepPdf, type LinkedReceipt } from "@/lib/standard-preparation-pdf";
import { usePrepDetail } from "@/components/standard-preparations/use-prep-detail";
import { buildPrepEditInitial } from "@/components/standard-preparations/prep-edit-initial";
import { getStandardSet } from "@/lib/standard-preparations/standard-set.functions";
import { generateStandardSetCutSheetPdf } from "@/lib/standard-preparations/cutsheet-pdf";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/$id")({
  component: PrepDetail,
});

function PrepDetail() {
  const { id } = Route.useParams();
  const { user, profile, role } = useAuth();
  const [editing, setEditing] = useState(false);
  const { query, updateMut, deleteMut, transitionMut, recordUsageMut, discardMut } = usePrepDetail(id);
  const { data, isLoading, error } = query;
  const getSetFn = useServerFn(getStandardSet);

  async function exportPdf(row: NonNullable<typeof data>["log"], linkedReceipt: LinkedReceipt, attachmentCount: number) {
    if (row.prep_type !== "standard_set") {
      exportPrepPdf(row, linkedReceipt, attachmentCount);
      return;
    }
    try {
      const detail = await getSetFn({ data: { id: row.id } });
      const doc = generateStandardSetCutSheetPdf({
        standardName: detail.standard_name,
        logNumber: detail.log_number,
        synId: detail.syn_id,
        preparedAt: detail.prepared_at,
        analystName: detail.analyst_name,
        diluentName: detail.final_diluent ?? "—",
        batchVolumeMl: detail.final_volume_ml ?? 0,
        levels: detail.levels.map(l => ({
          label: l.label,
          components: l.components.map(c => ({
            abbrev: c.compound_name.slice(0, 3).toUpperCase(),
            concMgPerMl: c.concentration_mg_per_ml,
            stockUl: c.stock_volume_ul,
          })),
          diluentUl: l.diluent_volume_ul,
          expectedNote: l.expected_note,
        })),
        rangeReasoning: detail.notes ?? "—",
        reviewerName: detail.reviewer_name,
        approvedAt: detail.approved_at,
      });
      doc.save(`${detail.log_number}_cutsheet.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate cut sheet");
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-sm text-destructive">Preparation not found.</div>;

  const r = data.log;
  const linked: LinkedReceipt = r.material_receipt ?? null;
  const canEdit = role === "admin" || role === "tech" || role === "reviewer";
  const canReview = role === "admin" || role === "reviewer";
  const actorName = profileDisplayName(profile, user?.email) || user?.email || "";

  if (editing) {
    const initial = buildPrepEditInitial(r, linked, data.targets);
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Edit {r.log_number}</h1>
        <PrepForm
          initial={initial}
          defaultAnalystName={r.analyst_name}
          submitting={updateMut.isPending}
          submitLabel="Save Changes"
          draftKey={`sop-draft:edit:${id}`}
          onSubmit={v => updateMut.mutate(prepValuesToPayload(v), { onSuccess: () => setEditing(false) })}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <PrepDetailHeader
        row={r}
        canEdit={canEdit}
        canReview={canReview}
        isAdmin={role === "admin"}
        actorName={actorName}
        transitionLoading={transitionMut.isPending}
        onEdit={() => setEditing(true)}
        onExportPdf={() => exportPdf(r, linked, data.attachments.length)}
        onTransition={(target, name) => transitionMut.mutate({ target, actor_name: name })}
        onDelete={() => deleteMut.mutate()}
      />
      <PrepDetailInfoCards row={r} linked={linked} />
      {r.final_volume_ml != null && (
        <PrepLifecycleCard
          finalVolumeMl={r.final_volume_ml}
          volumeRemainingMl={r.volume_remaining_ml}
          lifecycleStatus={r.lifecycle_status}
          usageLog={data.usageLog}
          canEdit={canEdit}
          canReview={canReview}
          actorName={actorName}
          onRecordUsage={(args) => recordUsageMut.mutate(args)}
          onDiscard={(args) => discardMut.mutate(args)}
          recordUsagePending={recordUsageMut.isPending}
          discardPending={discardMut.isPending}
        />
      )}
      <SequenceUsageCard entries={data.sequenceUsage} />
      <PrepStepsCard steps={r.preparation_steps ?? []} mixingDetails={r.mixing_details} />
      <PrepReviewCard row={r} />
      <TraceabilitySnapshot row={r} />
      <TargetsTable targets={data.targets} />

      <PrepAttachments logId={id} attachments={data.attachments} canEdit={canEdit && r.status !== "approved"} />
    </div>
  );
}

