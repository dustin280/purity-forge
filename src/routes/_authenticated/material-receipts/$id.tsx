import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Pencil, Trash2, Upload, FileText, ShieldCheck, X } from "lucide-react";
import {
  approveMaterialReceipt,
  deleteAttachment,
  deleteMaterialReceipt,
  getMaterialReceipt,
  recordAttachment,
  signAttachmentUrl,
  updateMaterialReceipt,
  type AttachmentKind,
  type MaterialReceiptRow,
  ATTACHMENT_KINDS,
} from "@/lib/material-receipts.functions";
import { ReceiptForm, valuesToPayload, type ReceiptFormValues } from "@/components/material-receipts/receipt-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/material-receipts/$id")({
  component: ReceiptDetail,
});

function ReceiptDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile, role } = useAuth();
  const get = useServerFn(getMaterialReceipt);
  const update = useServerFn(updateMaterialReceipt);
  const del = useServerFn(deleteMaterialReceipt);
  const approve = useServerFn(approveMaterialReceipt);

  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["material-receipt", id],
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: (patch: ReturnType<typeof valuesToPayload>) => update({ data: { id, patch } }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["material-receipt", id] });
      qc.invalidateQueries({ queryKey: ["material-receipts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Receipt deleted");
      navigate({ to: "/material-receipts" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (args: { approver_name: string; qc_pass: boolean }) => approve({ data: { id, ...args } }),
    onSuccess: () => {
      toast.success("Receipt updated");
      qc.invalidateQueries({ queryKey: ["material-receipt", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-sm text-destructive">Receipt not found.</div>;

  const r = data.receipt;
  const canEdit = role === "admin" || role === "tech" || role === "reviewer";
  const canApprove = role === "admin" || role === "reviewer";

  if (editing) {
    const initial: Partial<ReceiptFormValues> = {
      material_type: r.material_type,
      received_at: r.received_at.slice(0, 16),
      receiver_name: r.receiver_name,
      material_name: r.material_name,
      quantity: r.quantity?.toString() ?? "",
      unit: r.unit ?? "",
      supplier: r.supplier ?? "",
      po_number: r.po_number ?? "",
      notes: r.notes ?? "",
      purpose: r.purpose ?? "",
      manufacturer: r.manufacturer ?? "",
      manufacturer_lot: r.manufacturer_lot ?? "",
      catalog_number: r.catalog_number ?? "",
      expiry_date: r.expiry_date ?? "",
      container_details: r.container_details ?? "",
      coa_attached: r.coa_attached,
      sds_attached: r.sds_attached,
      visual_inspection: r.visual_inspection ?? "",
      visual_inspection_notes: r.visual_inspection_notes ?? "",
      temperature_on_receipt: r.temperature_on_receipt?.toString() ?? "",
      internal_lot: r.internal_lot ?? "",
      storage_location: r.storage_location ?? "",
      quarantine_status: r.quarantine_status,
      qc_pass: r.qc_pass == null ? "" : r.qc_pass ? "pass" : "fail",
      qc_results: r.qc_results ?? "",
      qc_analyst: r.qc_analyst ?? "",
      qc_date: r.qc_date ?? "",
    };
    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Edit {r.receipt_number}</h1>
        <ReceiptForm
          initial={initial}
          defaultReceiverName={r.receiver_name}
          submitting={updateMut.isPending}
          submitLabel="Save Changes"
          onSubmit={(v) => updateMut.mutate(valuesToPayload(v))}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const isControlled = r.material_type === "controlled";

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/material-receipts">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{r.receipt_number}</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{r.material_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={isControlled ? "default" : "secondary"}>{r.material_type}</Badge>
            {isControlled && (
              <Badge variant={
                r.quarantine_status === "released" ? "default"
                  : r.quarantine_status === "rejected" ? "destructive" : "outline"
              }>
                {r.quarantine_status}
              </Badge>
            )}
            {r.qc_pass != null && (
              <Badge variant={r.qc_pass ? "default" : "destructive"}>QC {r.qc_pass ? "Pass" : "Fail"}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportPdf(r)}>
            <FileDown className="size-4 mr-1" /> PDF
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          )}
          {canApprove && isControlled && r.approved_at == null && (
            <ApproveDialog
              defaultName={profileDisplayName(profile, user?.email) || user?.email || ""}
              onApprove={(approver_name, qc_pass) => approveMut.mutate({ approver_name, qc_pass })}
              loading={approveMut.isPending}
            />
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
                  <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All attached files will be removed too. This cannot be undone.
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Receipt</h2>
          <Row label="Received" value={new Date(r.received_at).toLocaleString()} />
          <Row label="Receiver" value={r.receiver_name} />
          <Row label="Quantity" value={r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"} />
          <Row label="Supplier" value={r.supplier} />
          <Row label="PO / Invoice" value={r.po_number} />
          {!isControlled && <Row label="Purpose" value={r.purpose} />}
          {r.notes && <Row label="Notes" value={r.notes} multiline />}
        </Card>

        {isControlled && (
          <Card className="p-5 space-y-2 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Manufacturer & Storage</h2>
            <Row label="Manufacturer" value={r.manufacturer} />
            <Row label="Mfr. lot" value={r.manufacturer_lot} />
            <Row label="Catalog #" value={r.catalog_number} />
            <Row label="Expiry" value={r.expiry_date} />
            <Row label="Container" value={r.container_details} />
            <Row label="Internal lot" value={r.internal_lot} />
            <Row label="Storage" value={r.storage_location} />
            <Row label="Temp on receipt" value={r.temperature_on_receipt != null ? `${r.temperature_on_receipt} °C` : null} />
            <Row label="Visual inspection" value={r.visual_inspection} />
            {r.visual_inspection_notes && <Row label="Inspection notes" value={r.visual_inspection_notes} multiline />}
          </Card>
        )}
      </div>

      {isControlled && (
        <Card className="p-5 mb-6 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">QC & Approval</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Row label="QC pass/fail" value={r.qc_pass == null ? "—" : r.qc_pass ? "Pass" : "Fail"} />
              <Row label="QC analyst" value={r.qc_analyst} />
              <Row label="QC date" value={r.qc_date} />
              {r.qc_results && <Row label="QC results" value={r.qc_results} multiline />}
            </div>
            <div className="space-y-2">
              <Row label="Approved at" value={r.approved_at ? new Date(r.approved_at).toLocaleString() : "Pending"} />
              <Row label="Approver" value={r.approver_name} />
            </div>
          </div>
        </Card>
      )}

      <Attachments receiptId={id} attachments={data.attachments} canEdit={canEdit} />
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

function ApproveDialog({ defaultName, onApprove, loading }: { defaultName: string; onApprove: (name: string, pass: boolean) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pass, setPass] = useState<"pass" | "fail">("pass");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><ShieldCheck className="size-4 mr-1" /> Approve / Release</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approval decision</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Approver name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Decision</Label>
            <Select value={pass} onValueChange={v => setPass(v as "pass" | "fail")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Pass — Release from quarantine</SelectItem>
                <SelectItem value="fail">Fail — Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={loading || !name.trim()} onClick={() => { onApprove(name.trim(), pass === "pass"); setOpen(false); }}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Attachments({ receiptId, attachments, canEdit }: { receiptId: string; attachments: Array<{ id: string; kind: AttachmentKind; file_path: string; file_name: string; uploaded_at: string }>; canEdit: boolean }) {
  const qc = useQueryClient();
  const record = useServerFn(recordAttachment);
  const del = useServerFn(deleteAttachment);
  const sign = useServerFn(signAttachmentUrl);
  const [kind, setKind] = useState<AttachmentKind>("coa");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${receiptId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("material-receipts").upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: {
            receipt_id: receiptId,
            kind,
            file_path: path,
            file_name: f.name,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["material-receipt", receiptId] });
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
      qc.invalidateQueries({ queryKey: ["material-receipt", receiptId] });
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
            <Select value={kind} onValueChange={v => setKind(v as AttachmentKind)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTACHMENT_KINDS.map(k => (
                  <SelectItem key={k} value={k}>{k.toUpperCase()}</SelectItem>
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
              <Badge variant="outline" className="uppercase text-[10px]">{a.kind}</Badge>
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

async function exportPdf(r: MaterialReceiptRow) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait" });
  doc.setFontSize(16);
  doc.text(`Material Receipt — ${r.receipt_number}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 24);

  const common: Array<[string, string]> = [
    ["Material type", r.material_type],
    ["Received at", new Date(r.received_at).toLocaleString()],
    ["Receiver", r.receiver_name],
    ["Material", r.material_name],
    ["Quantity", r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"],
    ["Supplier", r.supplier ?? "—"],
    ["PO / Invoice", r.po_number ?? "—"],
    ["Notes", r.notes ?? "—"],
  ];
  autoTable(doc, { startY: 30, head: [["Field", "Value"]], body: common, styles: { fontSize: 9 } });

  if (r.material_type === "controlled") {
    const controlled: Array<[string, string]> = [
      ["Manufacturer", r.manufacturer ?? "—"],
      ["Mfr. lot", r.manufacturer_lot ?? "—"],
      ["Catalog #", r.catalog_number ?? "—"],
      ["Expiry / retest", r.expiry_date ?? "—"],
      ["Container", r.container_details ?? "—"],
      ["COA attached", r.coa_attached ? "Yes" : "No"],
      ["SDS attached", r.sds_attached ? "Yes" : "No"],
      ["Visual inspection", r.visual_inspection ?? "—"],
      ["Inspection notes", r.visual_inspection_notes ?? "—"],
      ["Temp on receipt", r.temperature_on_receipt != null ? `${r.temperature_on_receipt} °C` : "—"],
      ["Internal lot", r.internal_lot ?? "—"],
      ["Storage", r.storage_location ?? "—"],
      ["Quarantine status", r.quarantine_status],
      ["QC pass/fail", r.qc_pass == null ? "—" : r.qc_pass ? "Pass" : "Fail"],
      ["QC analyst", r.qc_analyst ?? "—"],
      ["QC date", r.qc_date ?? "—"],
      ["QC results", r.qc_results ?? "—"],
      ["Approved at", r.approved_at ? new Date(r.approved_at).toLocaleString() : "Pending"],
      ["Approver", r.approver_name ?? "—"],
    ];
    autoTable(doc, { head: [["Controlled-material details", ""]], body: controlled, styles: { fontSize: 9 } });
  } else {
    autoTable(doc, { head: [["Field", "Value"]], body: [["Purpose", r.purpose ?? "—"]], styles: { fontSize: 9 } });
  }

  doc.save(`${r.receipt_number}.pdf`);
}