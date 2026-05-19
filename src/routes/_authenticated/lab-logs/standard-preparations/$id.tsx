import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Pencil, Trash2, Upload, FileText, X, ShieldCheck, Eye } from "lucide-react";
import {
  deletePrepAttachment,
  deleteStandardPreparation,
  getStandardPreparation,
  recordPrepAttachment,
  signPrepAttachmentUrl,
  transitionStandardPreparation,
  updateStandardPreparation,
  PREP_ATTACHMENT_KINDS,
  type PrepAttachmentKind,
  type StandardPrepRow,
} from "@/lib/standard-preparations.functions";
import { PrepForm, prepValuesToPayload, clearPrepDraft, type PrepFormValues } from "@/components/standard-preparations/prep-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/$id")({
  component: PrepDetail,
});

type LinkedReceipt = { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string } | null;

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
    queryKey: ["standard-preparation", id],
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: (patch: ReturnType<typeof prepValuesToPayload>) => update({ data: { id, patch } }),
    onSuccess: () => {
      clearPrepDraft(`sop-draft:edit:${id}`);
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["standard-preparation", id] });
      qc.invalidateQueries({ queryKey: ["standard-preparations"] });
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
      qc.invalidateQueries({ queryKey: ["standard-preparation", id] });
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
          <div className="font-mono text-sm text-muted-foreground">{r.log_number}</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{r.standard_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>
              {r.status}
            </Badge>
            {r.target_concentration && <Badge variant="outline">{r.target_concentration}</Badge>}
            {r.manufacturer_lot && <Badge variant="outline">Lot {r.manufacturer_lot}</Badge>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportPdf(r, linked, data.attachments.length)}>
            <FileDown className="size-4 mr-1" /> PDF
          </Button>
          {canEdit && r.status !== "approved" && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          )}
          {canReview && r.status === "draft" && (
            <TransitionDialog
              label="Mark Reviewed"
              title="Review preparation"
              actionText="Mark Reviewed"
              defaultName={actorName}
              loading={transitionMut.isPending}
              onConfirm={name => transitionMut.mutate({ target: "reviewed", actor_name: name })}
              trigger={<Button size="sm" variant="outline"><Eye className="size-4 mr-1" /> Mark Reviewed</Button>}
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
          <Row label="Prepared" value={new Date(r.prepared_at).toLocaleString()} />
          <Row label="Analyst" value={r.analyst_name} />
          <Row label="Target conc." value={r.target_concentration} />
          <Row label="Final volume" value={r.final_volume} />
          <Row label="Solvent" value={r.solvent} />
          <Row label="Mfr. lot" value={r.manufacturer_lot} />
        </Card>
        <Card className="p-5 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Storage & Linkage</h2>
          <Row label="Expiration" value={r.expiration_date} />
          <Row label="Condition" value={r.storage_condition} />
          <Row label="Location" value={r.storage_location} />
          <Row label="Container label" value={r.container_label} />
          {linked ? (
            <div className="pt-2 mt-2 border-t">
              <div className="text-xs text-muted-foreground mb-1">Linked Material Receipt</div>
              <Link to="/material-receipts/$id" params={{ id: linked.id }} className="text-sm hover:underline">
                <span className="font-mono">{linked.receipt_number}</span> — {linked.material_name}
                {linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}
              </Link>
            </div>
          ) : (
            <Row label="Linked receipt" value={null} />
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
            <Row label="Reviewed by" value={r.reviewer_name} />
            <Row label="Reviewed at" value={r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : null} />
          </div>
          <div className="space-y-2">
            <Row label="Approved by" value={r.approver_name} />
            <Row label="Approved at" value={r.approved_at ? new Date(r.approved_at).toLocaleString() : null} />
          </div>
        </div>
        {r.appearance_notes && <Row label="Appearance" value={r.appearance_notes} multiline />}
        {r.notes && <Row label="Notes" value={r.notes} multiline />}
      </Card>

      <PrepAttachments logId={id} attachments={data.attachments} canEdit={canEdit && r.status !== "approved"} />
    </div>
  );
}

function Row({ label, value, multiline }: { label: string; value: string | number | null | undefined; multiline?: boolean }) {
  return (
    <div className={multiline ? "flex flex-col gap-0.5" : "flex justify-between gap-4"}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap" : "text-right truncate"}>{value ?? "—"}</div>
    </div>
  );
}

function TransitionDialog({
  label, title, actionText, defaultName, loading, onConfirm, trigger,
}: {
  label: string; title: string; actionText: string; defaultName: string; loading: boolean;
  onConfirm: (name: string) => void; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">{label} as</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={loading || !name.trim()} onClick={() => { onConfirm(name.trim()); setOpen(false); }}>
            {actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrepAttachments({ logId, attachments, canEdit }: {
  logId: string;
  attachments: Array<{ id: string; kind: PrepAttachmentKind; file_path: string; file_name: string; uploaded_at: string }>;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const record = useServerFn(recordPrepAttachment);
  const del = useServerFn(deletePrepAttachment);
  const sign = useServerFn(signPrepAttachmentUrl);
  const [kind, setKind] = useState<PrepAttachmentKind>("weighing");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${logId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("standard-preparations").upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: {
            log_id: logId,
            kind,
            file_path: path,
            file_name: f.name,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["standard-preparation", logId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function openFile(path: string) {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeAttachment(id: string) {
    try {
      await del({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["standard-preparation", logId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={v => setKind(v as PrepAttachmentKind)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PREP_ATTACHMENT_KINDS.map(k => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex">
              <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
              <Button asChild size="sm" disabled={uploading}>
                <span><Upload className="size-4 mr-1" /> {uploading ? "Uploading…" : "Upload"}</span>
              </Button>
            </label>
          </div>
        )}
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No attachments yet.</div>
      ) : (
        <ul className="divide-y">
          {attachments.map(a => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <button onClick={() => openFile(a.file_path)} className="flex-1 min-w-0 text-left text-sm hover:underline truncate">
                {a.file_name}
              </button>
              <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(a.uploaded_at).toLocaleDateString()}</span>
              {canEdit && (
                <Button size="icon" variant="ghost" onClick={() => removeAttachment(a.id)} className="text-destructive size-7">
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function exportPdf(r: StandardPrepRow, linked: LinkedReceipt, attachmentCount: number) {
  const doc = new jsPDF();
  let y = 14;
  const line = (text: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10);
    const wrapped = doc.splitTextToSize(text, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * (opts?.size ?? 10) * 0.45 + 2;
    if (y > 280) { doc.addPage(); y = 14; }
  };
  line("Standard Preparation Log", { bold: true, size: 16 });
  line(r.log_number, { size: 10 });
  y += 2;
  line(`Standard: ${r.standard_name}`, { bold: true, size: 12 });
  line(`Status: ${r.status.toUpperCase()}`);
  line(`Prepared: ${new Date(r.prepared_at).toLocaleString()}`);
  line(`Analyst: ${r.analyst_name}`);
  if (r.target_concentration) line(`Target concentration: ${r.target_concentration}`);
  if (r.final_volume) line(`Final volume: ${r.final_volume}`);
  if (r.solvent) line(`Solvent: ${r.solvent}`);
  if (r.manufacturer_lot) line(`Manufacturer lot: ${r.manufacturer_lot}`);
  if (linked) line(`Linked receipt: ${linked.receipt_number} — ${linked.material_name}${linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}`);
  y += 2;
  if (r.preparation_steps?.length) {
    line("Steps", { bold: true });
    r.preparation_steps.forEach(s => {
      line(`${s.step_no}. ${s.description || "—"}`);
      const meta = [s.amount && `Amount: ${s.amount}`, s.instrument_id && `Instr: ${s.instrument_id}`, s.time && `Time: ${s.time}`].filter(Boolean).join(" · ");
      if (meta) line(`   ${meta}`);
    });
  }
  if (r.mixing_details) { y += 2; line("Mixing:", { bold: true }); line(r.mixing_details); }
  if (r.appearance_notes) { y += 2; line("Appearance:", { bold: true }); line(r.appearance_notes); }
  y += 2;
  line("Storage", { bold: true });
  if (r.expiration_date) line(`Expiration: ${r.expiration_date}`);
  if (r.storage_condition) line(`Condition: ${r.storage_condition}`);
  if (r.storage_location) line(`Location: ${r.storage_location}`);
  if (r.container_label) line(`Container: ${r.container_label}`);
  y += 2;
  line("Review & Approval", { bold: true });
  line(`Reviewed by: ${r.reviewer_name ?? "—"}${r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleString()}` : ""}`);
  line(`Approved by: ${r.approver_name ?? "—"}${r.approved_at ? ` on ${new Date(r.approved_at).toLocaleString()}` : ""}`);
  if (r.notes) { y += 2; line("Notes:", { bold: true }); line(r.notes); }
  line(`Attachments on file: ${attachmentCount}`);
  doc.save(`${r.log_number}.pdf`);
}