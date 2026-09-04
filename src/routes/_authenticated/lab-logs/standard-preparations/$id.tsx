import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PrepForm, prepValuesToPayload } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { TraceabilitySnapshot } from "@/components/standard-preparations/traceability-snapshot";
import { TargetsTable } from "@/components/standard-preparations/targets-table";
import { StandardSetLevelsTable } from "@/components/standard-preparations/standard-set-levels-table";
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
import {
  getStandardSet,
  createStandardSetRevision,
  listStandardSetRevisions,
} from "@/lib/standard-preparations/standard-set.functions";
import { generateStandardSetCutSheetPdf } from "@/lib/standard-preparations/cutsheet-pdf";
import {
  standardSetRunListCsv,
  abbrevFor,
} from "@/lib/standard-preparations/standard-set-run-list";
import {
  StandardSetRecipeEdit,
  type RecipeEditPayload,
} from "@/components/standard-preparations/standard-set-recipe-edit";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/$id")({
  component: PrepDetail,
});

function PrepDetail() {
  const { id } = Route.useParams();
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { query, updateMut, deleteMut, transitionMut, recordUsageMut, discardMut } =
    usePrepDetail(id);
  const { data, isLoading, error } = query;
  const getSetFn = useServerFn(getStandardSet);
  const createRevisionFn = useServerFn(createStandardSetRevision);
  const listRevisionsFn = useServerFn(listStandardSetRevisions);
  const actorName = profileDisplayName(profile, user?.email) || user?.email || "";

  const isStandardSet = data?.log.prep_type === "standard_set";
  const setDetailQ = useQuery({
    queryKey: qk.standardSetDetail.detail(id),
    queryFn: () => getSetFn({ data: { id } }),
    enabled: isStandardSet,
  });
  const revisionsQ = useQuery({
    queryKey: ["standard-set-revisions", id],
    queryFn: () => listRevisionsFn({ data: { id } }),
    enabled: isStandardSet,
  });

  const createRevisionMut = useMutation({
    mutationFn: (payload: RecipeEditPayload) =>
      createRevisionFn({ data: { analyst_name: actorName, ...payload } }),
    onSuccess: (res) => {
      toast.success(`Saved as ${res.log_number}`);
      // Route param changes reuse this component instance rather than
      // remounting it, so `editing` has to be reset explicitly -- otherwise
      // the new record loads straight into its own edit form.
      setEditing(false);
      navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function exportPdf(
    row: NonNullable<typeof data>["log"],
    linkedReceipt: LinkedReceipt,
    attachmentCount: number,
  ) {
    if (row.prep_type !== "standard_set") {
      exportPrepPdf(row, linkedReceipt, attachmentCount);
      return;
    }
    try {
      const detail = setDetailQ.data ?? (await getSetFn({ data: { id: row.id } }));
      const doc = generateStandardSetCutSheetPdf({
        standardName: detail.standard_name,
        logNumber: detail.log_number,
        preparedAt: detail.prepared_at,
        analystName: detail.analyst_name,
        diluentName: detail.final_diluent ?? "—",
        batchVolumeMl: detail.final_volume_ml ?? 0,
        levels: detail.levels.map((l) => ({
          label: l.label,
          components: l.components.map((c) => ({
            abbrev: abbrevFor(c.compound_name, c.source_label),
            concMgPerMl: c.concentration_mg_per_ml,
            stockUl: c.stock_volume_ul,
            stockConcMgPerMl: c.stock_concentration_mg_per_ml,
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

  async function downloadRunList(row: NonNullable<typeof data>["log"]) {
    try {
      const detail = setDetailQ.data ?? (await getSetFn({ data: { id: row.id } }));
      const csv = standardSetRunListCsv(detail);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${detail.log_number}_runlist.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build run list");
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data)
    return <div className="p-8 text-sm text-destructive">Preparation not found.</div>;

  const r = data.log;
  const linked: LinkedReceipt = r.material_receipt ?? null;
  const canEdit = role === "admin" || role === "tech" || role === "reviewer";
  const canReview = role === "admin" || role === "reviewer";

  if (editing && r.prep_type === "standard_set") {
    if (!setDetailQ.data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Correct {r.log_number}</h1>
        <StandardSetRecipeEdit
          detail={setDetailQ.data}
          saving={createRevisionMut.isPending}
          onSave={(payload) => createRevisionMut.mutate(payload)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

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
          onSubmit={(v) =>
            updateMut.mutate(prepValuesToPayload(v), { onSuccess: () => setEditing(false) })
          }
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
        onDownloadRunList={r.prep_type === "standard_set" ? () => downloadRunList(r) : undefined}
        onTransition={(target, name) => transitionMut.mutate({ target, actor_name: name })}
        onDelete={() => deleteMut.mutate()}
      />
      {setDetailQ.data?.revisedFrom && (
        <div className="mb-4 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
          Revision of{" "}
          <Link
            to="/lab-logs/standard-preparations/$id"
            params={{ id: setDetailQ.data.revisedFrom.id }}
            className="font-medium text-foreground underline underline-offset-2"
          >
            {setDetailQ.data.revisedFrom.log_number}
          </Link>
        </div>
      )}
      {revisionsQ.data && revisionsQ.data.length > 0 && (
        <div className="mb-4 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/40 rounded-md px-3 py-2">
          Revised{revisionsQ.data.length > 1 ? ` (${revisionsQ.data.length} times)` : ""} — see{" "}
          {revisionsQ.data.map((rev, i) => (
            <span key={rev.id}>
              {i > 0 && ", "}
              <Link
                to="/lab-logs/standard-preparations/$id"
                params={{ id: rev.id }}
                className="font-medium underline underline-offset-2"
              >
                {rev.log_number}
              </Link>
            </span>
          ))}
        </div>
      )}
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
      {isStandardSet && setDetailQ.data ? (
        <StandardSetLevelsTable
          levels={setDetailQ.data.levels}
          diluentName={setDetailQ.data.final_diluent}
          batchVolumeMl={setDetailQ.data.final_volume_ml}
        />
      ) : (
        <TargetsTable targets={data.targets} />
      )}

      <PrepAttachments
        logId={id}
        attachments={data.attachments}
        canAttach={canEdit}
        canRemove={canEdit && r.status !== "approved"}
      />
    </div>
  );
}
