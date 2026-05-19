import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listCocFields, listCocRecords, getCocRecord,
  createCocRecord, updateCocRecord, deleteCocRecord,
  listParameters,
} from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardList, Eye, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { buildCocPdf, safeFileName, type CocFieldLite } from "@/lib/coc-pdf";

export const Route = createFileRoute("/_authenticated/chain-of-custody")({ component: CocPage });

type CocField = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "date" | "datetime" | "email" | "tel" | "multiselect";
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  placeholder: string | null;
};
type CocRecord = { id: string; sample_id: string; data: Record<string, unknown>; created_at: string };

function CocPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const listRecords = useServerFn(listCocRecords);
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const del = useServerFn(deleteCocRecord);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["coc_records"],
    queryFn: () => listRecords() as Promise<CocRecord[]>,
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["coc_fields"],
    queryFn: () => listFields() as Promise<CocField[]>,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: ["coc_records"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  function openNew() { setEditingId(null); setOpen(true); }
  function openEdit(id: string) { setEditingId(id); setOpen(true); }

  const fieldsForPdf: CocFieldLite[] = useMemo(
    () => fields.map(f => ({ field_key: f.field_key, label: f.label })),
    [fields]
  );

  function toggleOne(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(records.map(r => r.id)) : new Set());
  }

  async function downloadOne(id: string) {
    try {
      const rec = (await getRec({ data: { id } })) as CocRecord;
      const doc = buildCocPdf(rec, fieldsForPdf);
      doc.save(`COC_${safeFileName(rec.sample_id)}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download");
    }
  }

  async function downloadSelected() {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const ids = Array.from(selected);
      if (ids.length === 1) {
        await downloadOne(ids[0]);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const id of ids) {
          const rec = (await getRec({ data: { id } })) as CocRecord;
          const doc = buildCocPdf(rec, fieldsForPdf);
          zip.file(`COC_${safeFileName(rec.sample_id)}_${id.slice(0, 8)}.pdf`, doc.output("blob"));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chain-of-custody-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(`Downloaded ${ids.length} record${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk download failed");
    } finally {
      setDownloading(false);
    }
  }

  const allChecked = records.length > 0 && selected.size === records.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Receipt</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Chain of Custody</h1>
          <p className="text-sm text-muted-foreground mt-1">Documented record of every sample received by the lab.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-1" /> New Chain of Custody
        </Button>
      </div>

      {records.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label="Select all"
          />
          <span>
            {selected.size > 0 ? `${selected.size} selected` : `Select records to download`}
          </span>
          <div className="flex-1" />
          <Button
            size="sm" variant="outline"
            disabled={selected.size === 0 || downloading}
            onClick={downloadSelected}
          >
            <Download className="size-3.5 mr-1" />
            {downloading ? "Preparing…" : selected.size > 1 ? `Download ${selected.size} as ZIP` : "Download PDF"}
          </Button>
        </div>
      )}

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 mx-auto mb-2 opacity-40" />
            No chain of custody records yet. Click <span className="font-medium">New Chain of Custody</span> to create one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {records.map(r => {
              const product = (r.data?.product_name as string) || "";
              const client = (r.data?.client_company as string) || "";
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) => toggleOne(r.id, v === true)}
                    aria-label={`Select ${r.sample_id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.sample_id}{product ? ` — ${product}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {client || "—"} · {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setViewingId(r.id)}>
                    <Eye className="size-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadOne(r.id)}>
                    <Download className="size-3.5 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(r.id)}>
                    <Pencil className="size-3.5 mr-1" /> Edit
                  </Button>
                  {role === "admin" && (
                    <Button size="icon" variant="ghost"
                      onClick={() => { if (confirm(`Delete record ${r.sample_id}?`)) delMut.mutate(r.id); }}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CocFormDialog open={open} onOpenChange={setOpen} recordId={editingId} />
      <CocViewDialog
        recordId={viewingId}
        onOpenChange={(v) => { if (!v) setViewingId(null); }}
        fields={fields}
        onDownload={(id) => downloadOne(id)}
      />
    </div>
  );
}

function CocViewDialog({ recordId, onOpenChange, fields, onDownload }: {
  recordId: string | null;
  onOpenChange: (v: boolean) => void;
  fields: CocField[];
  onDownload: (id: string) => void;
}) {
  const getRec = useServerFn(getCocRecord);
  const { data: rec } = useQuery({
    queryKey: ["coc_record_view", recordId],
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: !!recordId,
  });
  const open = !!recordId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Chain of Custody {rec ? `— ${rec.sample_id}` : ""}
          </DialogTitle>
        </DialogHeader>
        {!rec ? (
          <div className="py-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2 py-2">
            <div className="text-xs text-muted-foreground mb-3">
              Created {new Date(rec.created_at).toLocaleString()}
            </div>
            <dl className="grid sm:grid-cols-[200px_1fr] gap-x-4 gap-y-2 text-sm">
              {fields.map(f => {
                const v = rec.data?.[f.field_key];
                const display = v == null || v === "" ? "—" : String(v);
                return (
                  <div key={f.id} className="sm:contents">
                    <dt className="font-medium text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap break-words border-b border-border pb-2 sm:border-0 sm:pb-0">
                      {display}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {rec && (
            <Button onClick={() => onDownload(rec.id)}>
              <Download className="size-4 mr-1" /> Download PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CocFormDialog({ open, onOpenChange, recordId }: {
  open: boolean; onOpenChange: (v: boolean) => void; recordId: string | null;
}) {
  const qc = useQueryClient();
  const listFields = useServerFn(listCocFields);
  const getRec = useServerFn(getCocRecord);
  const create = useServerFn(createCocRecord);
  const update = useServerFn(updateCocRecord);

  const { data: fields = [] } = useQuery({
    queryKey: ["coc_fields"],
    queryFn: () => listFields() as Promise<CocField[]>,
    enabled: open,
  });
  const { data: existing } = useQuery({
    queryKey: ["coc_record", recordId],
    queryFn: () => getRec({ data: { id: recordId! } }) as Promise<CocRecord>,
    enabled: open && !!recordId,
  });

  const activeFields = useMemo(() => fields.filter(f => f.is_active), [fields]);
  const [values, setValues] = useState<Record<string, string>>({});

  // Reset values when dialog opens or data loads
  const sig = `${open ? "1" : "0"}|${recordId ?? "new"}|${activeFields.map(f => f.field_key).join(",")}|${existing?.id ?? ""}`;
  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    activeFields.forEach(f => {
      const v = existing?.data?.[f.field_key];
      init[f.field_key] = v == null ? "" : String(v);
    });
    setValues(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const sampleIdVal = values.sample_id?.trim();
      if (!sampleIdVal) throw new Error("Sample ID is required");
      const data: Record<string, string | number | null> = {};
      activeFields.forEach(f => {
        const raw = values[f.field_key]?.trim() ?? "";
        if (raw === "") { data[f.field_key] = null; return; }
        if (f.field_type === "number") {
          const n = Number(raw);
          data[f.field_key] = isNaN(n) ? raw : n;
        } else {
          data[f.field_key] = raw;
        }
      });
      if (recordId) {
        await update({ data: { id: recordId, sample_id: sampleIdVal, data } });
      } else {
        await create({ data: { sample_id: sampleIdVal, data } });
      }
    },
    onSuccess: () => {
      toast.success(recordId ? "Record updated" : "Record created");
      qc.invalidateQueries({ queryKey: ["coc_records"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  function renderField(f: CocField) {
    const v = values[f.field_key] ?? "";
    const set = (val: string) => setValues(prev => ({ ...prev, [f.field_key]: val }));
    const common = {
      id: f.field_key,
      value: v,
      placeholder: f.placeholder ?? "",
      required: f.is_required,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value),
    };
    if (f.field_type === "textarea") return <Textarea rows={3} {...common} />;
    const typeMap: Record<string, string> = {
      text: "text", number: "number", date: "date",
      datetime: "datetime-local", email: "email", tel: "tel",
    };
    return <Input type={typeMap[f.field_type] ?? "text"} {...common} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recordId ? "Edit Chain of Custody" : "New Chain of Custody"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="grid gap-4 py-2 sm:grid-cols-2"
        >
          {activeFields.map(f => (
            <div key={f.id} className={f.field_type === "textarea" ? "sm:col-span-2" : ""}>
              <Label htmlFor={f.field_key} className="text-xs">
                {f.label}{f.is_required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <div className="mt-1">{renderField(f)}</div>
            </div>
          ))}
          <DialogFooter className="sm:col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : recordId ? "Save changes" : "Create record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
