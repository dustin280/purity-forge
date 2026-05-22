import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Pencil, Trash2, ShieldCheck, Eye } from "lucide-react";
import {
  deleteStandardPreparation,
  getStandardPreparation,
  transitionStandardPreparation,
  updateStandardPreparation,
} from "@/lib/standard-preparations.functions";
import { PrepForm, prepValuesToPayload, clearPrepDraft, type PrepFormValues } from "@/components/standard-preparations/prep-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { STATUS_LABEL } from "@/lib/lims-utils";
import { qk } from "@/lib/query-keys";
import { InfoRow } from "@/components/standard-preparations/info-row";
import { TraceabilitySnapshot } from "@/components/standard-preparations/traceability-snapshot";
import { TargetsTable } from "@/components/standard-preparations/targets-table";
import { TransitionDialog } from "@/components/standard-preparations/transition-dialog";
import { PrepAttachments } from "@/components/standard-preparations/prep-attachments";
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
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="font-mono text-sm text-muted-foreground">
            {r.log_number}
            {r.syn_id && <span className="ml-2 text-foreground">· {r.syn_id}</span>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{r.standard_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>
              {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}
            </Badge>
            {r.target_concentration && <Badge variant="outline">{r.target_concentration}</Badge>}
            {r.manufacturer_lot && <Badge variant="outline">Lot {r.manufacturer_lot}</Badge>}
            {r.batch_group_id && (
              <Link to="/lab-logs/standard-preparations/batch/$groupId" params={{ groupId: r.batch_group_id }}>
                <Badge variant="secondary" className="cursor-pointer">View batch</Badge>
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportPrepPdf(r, linked, data.attachments.length)}>
            <FileDown className="size-4 mr-1" /> PDF
          </Button>
          {canEdit && r.status !== "approved" && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          )}
          {canReview && r.status === "draft" && (
            <TransitionDialog
              label="Mark In Review"
              title="Review preparation"
              actionText="Mark In Review"
              defaultName={actorName}
              loading={transitionMut.isPending}
              onConfirm={name => transitionMut.mutate({ target: "reviewed", actor_name: name })}
              trigger={<Button size="sm" variant="outline"><Eye className="size-4 mr-1" /> Mark In Review</Button>}
            />
          )}
          {canReview && r.status === "reviewed" && (
            <TransitionDialog
              label="Approve"
              title="Approve preparation"
              actionText="Approve"
              defaultName={actorName}
              loading={transitionMut.isPending}
              onConfirm={name => transitionMut.mutate({ target: "approved", actor_name: name })}
              trigger={<Button size="sm"><ShieldCheck className="size-4 mr-1" /> Approve</Button>}
            />
          )}
          {canReview && r.status !== "draft" && (
            <Button size="sm" variant="ghost" disabled={transitionMut.isPending}
              onClick={() => transitionMut.mutate({ target: "draft", actor_name: actorName || "system" })}>
              Revert to Draft
            </Button>
          )}
          {role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this preparation log?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Attached files will also be removed. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMut.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-5 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preparation</h2>
          <InfoRow label="Prepared" value={new Date(r.prepared_at).toLocaleString()} />
          <InfoRow label="Analyst" value={r.analyst_name} />
          <InfoRow label="Target conc." value={r.target_concentration} />
          <InfoRow label="Final volume" value={r.final_volume} />
          <InfoRow label="Solvent" value={r.solvent} />
          <InfoRow label="Mfr. lot" value={r.manufacturer_lot} />
        </Card>
        <Card className="p-5 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Storage & Linkage</h2>
          <InfoRow label="Expiration" value={r.expiration_date} />
          <InfoRow label="Condition" value={r.storage_condition} />
          <InfoRow label="Location" value={r.storage_location} />
          <InfoRow label="Container label" value={r.container_label} />
          {linked ? (
            <div className="pt-2 mt-2 border-t">
              <div className="text-xs text-muted-foreground mb-1">Linked Material Receipt</div>
              <Link to="/material-receipts/$id" params={{ id: linked.id }} className="text-sm hover:underline">
                <span className="font-mono">{linked.receipt_number}</span> — {linked.material_name}
                {linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}
              </Link>
            </div>
          ) : (
            <InfoRow label="Linked receipt" value={null} />
          )}
        </Card>
      </div>

      {r.preparation_steps?.length > 0 && (
        <Card className="p-5 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Steps</h2>
          <ol className="space-y-2 text-sm">
            {r.preparation_steps.map((s, i) => (
              <li key={i} className="flex gap-3 border-b last:border-0 pb-2 last:pb-0">
                <div className="font-mono text-xs text-muted-foreground w-6 pt-0.5">{s.step_no}</div>
                <div className="flex-1 min-w-0">
                  <div className="whitespace-pre-wrap">{s.description || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[s.amount && `Amount: ${s.amount}`, s.instrument_id && `Instr: ${s.instrument_id}`, s.time && `Time: ${s.time}`].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {r.mixing_details && (
            <div className="mt-3 pt-3 border-t text-sm">
              <div className="text-xs text-muted-foreground mb-1">Mixing / sonication / heating</div>
              <div className="whitespace-pre-wrap">{r.mixing_details}</div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5 mb-6 space-y-2 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Review & Approval</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <InfoRow label="In Review by" value={r.reviewer_name} />
            <InfoRow label="In Review at" value={r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : null} />
          </div>
          <div className="space-y-2">
            <InfoRow label="Approved by" value={r.approver_name} />
            <InfoRow label="Approved at" value={r.approved_at ? new Date(r.approved_at).toLocaleString() : null} />
          </div>
        </div>
        {r.appearance_notes && <InfoRow label="Appearance" value={r.appearance_notes} multiline />}
        {r.notes && <InfoRow label="Notes" value={r.notes} multiline />}
      </Card>

      <TraceabilitySnapshot row={r} />
      <TargetsTable targets={data.targets} />

      <PrepAttachments logId={id} attachments={data.attachments} canEdit={canEdit && r.status !== "approved"} />
    </div>
  );
}

