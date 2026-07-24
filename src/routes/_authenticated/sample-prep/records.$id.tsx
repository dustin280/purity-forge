import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Printer, Save, Send, Trash2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import {
  approveRecord,
  deleteDraft,
  getRecord,
  rejectRecord,
  saveExecutedStep,
  startExecution,
  submitForReview,
  type PrepStep,
  type RecordStatus,
} from "@/lib/sample-prep/records.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/records/$id")({
  head: ({ params }) => ({ meta: [
    { title: `Preparation ${params.id.slice(0, 8)} · Sample Prep` },
    { name: "description", content: "Preparation record execution and reviewer sign-off." },
    { property: "og:title", content: "Preparation Record" },
    { property: "og:description", content: "Bench execution and reviewer sign-off for a sample preparation." },
  ]}),
  component: PrepRecordDetail,
});

const STATUS_LABELS: Record<RecordStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_VARIANT: Record<RecordStatus, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  in_progress: "secondary",
  awaiting_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

function PrepRecordDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getRecord);
  const startFn = useServerFn(startExecution);
  const submitFn = useServerFn(submitForReview);
  const approveFn = useServerFn(approveRecord);
  const rejectFn = useServerFn(rejectRecord);
  const deleteFn = useServerFn(deleteDraft);

  const q = useQuery({ queryKey: ["sp-record", id], queryFn: () => get({ data: { id } }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sp-record", id] });

  const startMut = useMutation({ mutationFn: () => startFn({ data: { id } }), onSuccess: () => { toast.success("Execution started"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const submitMut = useMutation({ mutationFn: () => submitFn({ data: { id } }), onSuccess: () => { toast.success("Submitted for review"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const approveMut = useMutation({ mutationFn: (comment: string | null) => approveFn({ data: { id, comment } }), onSuccess: () => { toast.success("Approved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const rejectMut = useMutation({ mutationFn: (comment: string) => rejectFn({ data: { id, comment } }), onSuccess: () => { toast.success("Rejected"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Draft deleted"); navigate({ to: "/sample-prep/records" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [reviewComment, setReviewComment] = useState("");

  if (q.isLoading) return <SamplePrepShell title="Preparation Record"><Card className="p-6 text-sm">Loading…</Card></SamplePrepShell>;
  if (q.isError || !q.data) return <SamplePrepShell title="Preparation Record"><Card className="p-6 text-sm text-destructive">Failed to load record.</Card></SamplePrepShell>;

  const { record, steps } = q.data;
  const status = record.status as RecordStatus;
  const canEditActuals = status === "draft" || status === "in_progress" || status === "rejected";

  return (
    <SamplePrepShell title={`Preparation ${record.prep_number}`} description="Capture bench execution and route through review.">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sample-prep/records"><ArrowLeft className="size-4 mr-1" /> Back to records</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" /> Print</Button>
          {status === "draft" && <Button size="sm" onClick={() => startMut.mutate()} disabled={startMut.isPending}>Start execution</Button>}
          {(status === "in_progress" || status === "rejected") && (
            <Button size="sm" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
              <Send className="size-4 mr-1" /> Submit for review
            </Button>
          )}
          {status === "awaiting_review" && (
            <>
              <Button size="sm" variant="default" onClick={() => approveMut.mutate(reviewComment || null)} disabled={approveMut.isPending}>
                <CheckCircle2 className="size-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => {
                if (!reviewComment.trim()) { toast.error("Add a rejection comment"); return; }
                rejectMut.mutate(reviewComment.trim());
              }} disabled={rejectMut.isPending}>
                <XCircle className="size-4 mr-1" /> Reject
              </Button>
            </>
          )}
          {status === "draft" && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this draft?")) deleteMut.mutate(); }}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Prep number</div>
            <div className="font-mono text-lg">{record.prep_number}</div>
          </div>
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Sample" value={record.sample_id ?? "—"} />
          <Field label="Lot" value={record.lot_number ?? "—"} />
          <Field label="Target conc." value={record.planned_target_concentration_mg_per_ml != null ? `${record.planned_target_concentration_mg_per_ml} mg/mL` : "—"} />
          <Field label="Final volume" value={record.planned_target_volume_ul != null ? `${record.planned_target_volume_ul} µL` : "—"} />
          <Field label="Prepared at" value={record.prepared_at ? new Date(record.prepared_at).toLocaleString() : "—"} />
          <Field label="Submitted" value={record.submitted_at ? new Date(record.submitted_at).toLocaleString() : "—"} />
          <Field label="Reviewed" value={record.reviewed_at ? new Date(record.reviewed_at).toLocaleString() : "—"} />
          <Field label="Expires" value={record.expires_at ? new Date(record.expires_at).toLocaleString() : "—"} />
        </div>
        {record.notes && (
          <div className="text-sm border rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-1">Analyst notes</div>
            <div className="whitespace-pre-wrap">{record.notes}</div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Bench execution</h2>
          {!canEditActuals && <span className="text-xs text-muted-foreground">Locked in current status</span>}
        </div>
        {steps.length === 0 && <p className="text-sm text-muted-foreground">No steps captured.</p>}
        <div className="space-y-3">
          {steps.map(s => (
            <StepEditor key={s.id} step={s} editable={canEditActuals} onSaved={invalidate} />
          ))}
        </div>
      </Card>

      {status === "awaiting_review" && (
        <Card className="p-4 space-y-2 print:hidden">
          <Label htmlFor="review-comment" className="flex items-center gap-2"><ClipboardCheck className="size-4" /> Reviewer comment (required to reject)</Label>
          <Textarea id="review-comment" value={reviewComment} onChange={e => setReviewComment(e.target.value)} rows={3} />
        </Card>
      )}

      {record.review_comment && status !== "awaiting_review" && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Reviewer comment</div>
          <div className="text-sm whitespace-pre-wrap">{record.review_comment}</div>
        </Card>
      )}
    </SamplePrepShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function StepEditor({ step, editable, onSaved }: { step: PrepStep; editable: boolean; onSaved: () => void }) {
  const save = useServerFn(saveExecutedStep);
  const [form, setForm] = useState({
    actual_mass_mg: step.actual_mass_mg?.toString() ?? "",
    actual_volume_ul: step.actual_volume_ul?.toString() ?? "",
    actual_diluent_ul: step.actual_diluent_ul?.toString() ?? "",
    actual_final_volume_ul: step.actual_final_volume_ul?.toString() ?? "",
    actual_conc_mg_per_ml: step.actual_conc_mg_per_ml?.toString() ?? "",
    performed_by_initials: step.performed_by_initials ?? "",
    deviation_flag: step.deviation_flag,
    notes: step.notes ?? "",
  });
  useEffect(() => {
    setForm({
      actual_mass_mg: step.actual_mass_mg?.toString() ?? "",
      actual_volume_ul: step.actual_volume_ul?.toString() ?? "",
      actual_diluent_ul: step.actual_diluent_ul?.toString() ?? "",
      actual_final_volume_ul: step.actual_final_volume_ul?.toString() ?? "",
      actual_conc_mg_per_ml: step.actual_conc_mg_per_ml?.toString() ?? "",
      performed_by_initials: step.performed_by_initials ?? "",
      deviation_flag: step.deviation_flag,
      notes: step.notes ?? "",
    });
  }, [step.id, step.actual_mass_mg, step.actual_volume_ul, step.actual_diluent_ul, step.actual_final_volume_ul, step.actual_conc_mg_per_ml, step.performed_by_initials, step.deviation_flag, step.notes]);

  const saveMut = useMutation({
    mutationFn: async () => save({ data: { step_id: step.id, patch: {
      actual_mass_mg: form.actual_mass_mg ? Number(form.actual_mass_mg) : null,
      actual_volume_ul: form.actual_volume_ul ? Number(form.actual_volume_ul) : null,
      actual_diluent_ul: form.actual_diluent_ul ? Number(form.actual_diluent_ul) : null,
      actual_final_volume_ul: form.actual_final_volume_ul ? Number(form.actual_final_volume_ul) : null,
      actual_conc_mg_per_ml: form.actual_conc_mg_per_ml ? Number(form.actual_conc_mg_per_ml) : null,
      performed_by_initials: form.performed_by_initials || null,
      deviation_flag: form.deviation_flag,
      notes: form.notes || null,
      performed_at: new Date().toISOString(),
    }}}),
    onSuccess: () => { toast.success(`Step ${step.step_no} saved`); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const planned = step.planned as Record<string, unknown>;
  const instruction = typeof planned?.instruction === "string" ? planned.instruction : "";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">Step {step.step_no}<span className="ml-2 text-xs text-muted-foreground capitalize">({step.kind})</span></div>
        {step.deviation_flag && <Badge variant="destructive">Deviation</Badge>}
      </div>
      {instruction && <div className="text-xs text-muted-foreground">{instruction}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {step.kind === "reconstitute" && (
          <NumField label="Actual mass (mg)" value={form.actual_mass_mg} onChange={v => setForm(f => ({ ...f, actual_mass_mg: v }))} disabled={!editable} />
        )}
        <NumField label="Aliquot (µL)" value={form.actual_volume_ul} onChange={v => setForm(f => ({ ...f, actual_volume_ul: v }))} disabled={!editable} />
        <NumField label="Diluent (µL)" value={form.actual_diluent_ul} onChange={v => setForm(f => ({ ...f, actual_diluent_ul: v }))} disabled={!editable} />
        <NumField label="Final volume (µL)" value={form.actual_final_volume_ul} onChange={v => setForm(f => ({ ...f, actual_final_volume_ul: v }))} disabled={!editable} />
        <NumField label="Actual conc. (mg/mL)" value={form.actual_conc_mg_per_ml} onChange={v => setForm(f => ({ ...f, actual_conc_mg_per_ml: v }))} disabled={!editable} />
        <div className="space-y-1">
          <Label className="text-xs">Initials</Label>
          <Input value={form.performed_by_initials} onChange={e => setForm(f => ({ ...f, performed_by_initials: e.target.value }))} disabled={!editable} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={form.deviation_flag} onChange={e => setForm(f => ({ ...f, deviation_flag: e.target.checked }))} disabled={!editable} />
          Flag deviation
        </label>
      </div>
      <Textarea placeholder="Step notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={!editable} />
      {editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="size-4 mr-1" /> Save step
          </Button>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}