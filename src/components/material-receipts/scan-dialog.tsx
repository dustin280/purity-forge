import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scanMaterialReceipt, type ScannedReceipt } from "@/lib/material-receipts/receipts-scan.functions";
import { createMaterialReceipt, recordAttachment } from "@/lib/material-receipts.functions";
import { emptyValues, valuesToPayload, type ReceiptFormValues } from "./receipt-form-logic";
import { supabase } from "@/integrations/supabase/client";
import { assertUploadable, DOCUMENT_MIME_ALLOWLIST } from "@/lib/upload-validation";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";

const MAX_IMAGES = 4;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function str(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}

function scanToValues(scan: ScannedReceipt, receiverName: string): ReceiptFormValues {
  const base = emptyValues(receiverName);
  return {
    ...base,
    material_type: scan.material_type ?? base.material_type,
    material_name: str(scan.material_name),
    manufacturer: str(scan.manufacturer),
    supplier: str(scan.supplier),
    manufacturer_lot: str(scan.manufacturer_lot),
    catalog_number: str(scan.catalog_number),
    quantity: str(scan.quantity),
    unit: str(scan.unit),
    expiry_date: str(scan.expiry_date),
    po_number: str(scan.po_number),
    invoice_number: str(scan.invoice_number),
    invoice_date: str(scan.invoice_date),
    unit_price: str(scan.unit_price),
    total_price: str(scan.total_price),
    tax_amount: str(scan.tax_amount),
    shipping_cost: str(scan.shipping_cost),
    currency: str(scan.currency) || base.currency,
    freight_tracking_number: str(scan.freight_tracking_number),
    container_details: str(scan.container_details),
    purity_percent: str(scan.purity_percent),
    storage_location: str(scan.storage_location),
    notes: str(scan.notes),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScanNewItemDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const receiverName = profileDisplayName(profile, null);
  const scan = useServerFn(scanMaterialReceipt);
  const create = useServerFn(createMaterialReceipt);
  const record = useServerFn(recordAttachment);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [values, setValues] = useState<ReceiptFormValues | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFiles([]);
    setPreviews([]);
    setValues(null);
    setSummary("");
    setConfidence(null);
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list).slice(0, MAX_IMAGES - files.length);
    try {
      const urls = await Promise.all(incoming.map(fileToDataUrl));
      setFiles((p) => [...p, ...incoming]);
      setPreviews((p) => [...p, ...urls]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const scanMut = useMutation({
    mutationFn: async () => {
      const images = await Promise.all(
        files.map(async (f) => ({ data_url: await fileToDataUrl(f), name: f.name })),
      );
      return scan({ data: { images } });
    },
    onSuccess: (result) => {
      setValues(scanToValues(result, receiverName));
      setSummary(str(result.summary));
      setConfidence(typeof result.confidence === "number" ? result.confidence : null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async (v: ReceiptFormValues) => {
      const row = await create({ data: valuesToPayload(v) });
      for (const file of files) {
        try {
          assertUploadable(file, DOCUMENT_MIME_ALLOWLIST);
          const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "scan.jpg";
          const path = `${row.id}/${Date.now()}-${safeName}`;
          const { error } = await supabase.storage.from("material-receipts").upload(path, file);
          if (error) throw error;
          await record({
            data: {
              receipt_id: row.id,
              kind: "photo",
              file_path: path,
              file_name: file.name,
              content_type: file.type || null,
              size_bytes: file.size,
            },
          });
        } catch (e) {
          toast.error(`Photo not attached: ${(e as Error).message}`);
        }
      }
      return row;
    },
    onSuccess: (row) => {
      toast.success(`Created ${row.receipt_number}`);
      close(false);
      navigate({ to: "/material-receipts/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function up<K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) {
    setValues((prev) => (prev ? { ...prev, [k]: val } : prev));
  }

  const busy = scanMut.isPending || saveMut.isPending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5" /> Scan New Item
          </DialogTitle>
          <DialogDescription>
            Photograph the invoice, label, CoA or box. The scan drafts a material receipt for you to approve.
          </DialogDescription>
        </DialogHeader>

        {!values ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={files.length >= MAX_IMAGES || busy}>
                <Camera className="size-4 mr-1" /> Take photo
              </Button>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_IMAGES || busy}>
                <ImagePlus className="size-4 mr-1" /> Choose image
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative rounded-md overflow-hidden border">
                    <img src={src} alt={`Scan ${i + 1}`} className="w-full h-28 object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-1"
                      onClick={() => {
                        setFiles((p) => p.filter((_, idx) => idx !== i));
                        setPreviews((p) => p.filter((_, idx) => idx !== i));
                      }}
                      aria-label="Remove image"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Up to {MAX_IMAGES} images per scan. Clear, well-lit close-ups read best.
            </p>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button type="button" onClick={() => scanMut.mutate()} disabled={files.length === 0 || busy}>
                {scanMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
                {scanMut.isPending ? "Reading…" : "Scan & process"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Review the automated selections</Badge>
              {confidence !== null && (
                <Badge variant={confidence >= 0.7 ? "default" : "outline"}>
                  Confidence {Math.round(confidence * 100)}%
                </Badge>
              )}
            </div>
            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Material type">
                <Select value={values.material_type} onValueChange={(t) => up("material_type", t as ReceiptFormValues["material_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="controlled">Controlled</SelectItem>
                    <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Received">
                <Input type="datetime-local" value={values.received_at} onChange={(e) => up("received_at", e.target.value)} />
              </Field>
              <Field label="Material name">
                <Input value={values.material_name} onChange={(e) => up("material_name", e.target.value)} />
              </Field>
              <Field label="Receiver">
                <Input value={values.receiver_name} onChange={(e) => up("receiver_name", e.target.value)} />
              </Field>
              <Field label="Manufacturer">
                <Input value={values.manufacturer} onChange={(e) => up("manufacturer", e.target.value)} />
              </Field>
              <Field label="Supplier">
                <Input value={values.supplier} onChange={(e) => up("supplier", e.target.value)} />
              </Field>
              <Field label="Manufacturer lot">
                <Input value={values.manufacturer_lot} onChange={(e) => up("manufacturer_lot", e.target.value)} />
              </Field>
              <Field label="Catalog number">
                <Input value={values.catalog_number} onChange={(e) => up("catalog_number", e.target.value)} />
              </Field>
              <Field label="Quantity">
                <Input value={values.quantity} onChange={(e) => up("quantity", e.target.value)} />
              </Field>
              <Field label="Unit">
                <Input value={values.unit} onChange={(e) => up("unit", e.target.value)} />
              </Field>
              <Field label="Expiry date">
                <Input type="date" value={values.expiry_date} onChange={(e) => up("expiry_date", e.target.value)} />
              </Field>
              <Field label="Storage location">
                <Input value={values.storage_location} onChange={(e) => up("storage_location", e.target.value)} />
              </Field>
              <Field label="PO number">
                <Input value={values.po_number} onChange={(e) => up("po_number", e.target.value)} />
              </Field>
              <Field label="Invoice number">
                <Input value={values.invoice_number} onChange={(e) => up("invoice_number", e.target.value)} />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={values.invoice_date} onChange={(e) => up("invoice_date", e.target.value)} />
              </Field>
              <Field label="Currency">
                <Input value={values.currency} onChange={(e) => up("currency", e.target.value)} />
              </Field>
              <Field label="Unit price">
                <Input value={values.unit_price} onChange={(e) => up("unit_price", e.target.value)} />
              </Field>
              <Field label="Total price">
                <Input value={values.total_price} onChange={(e) => up("total_price", e.target.value)} />
              </Field>
              <Field label="Tracking number">
                <Input value={values.freight_tracking_number} onChange={(e) => up("freight_tracking_number", e.target.value)} />
              </Field>
              <Field label="Container details">
                <Input value={values.container_details} onChange={(e) => up("container_details", e.target.value)} />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea rows={3} value={values.notes} onChange={(e) => up("notes", e.target.value)} />
            </Field>

            <p className="text-xs text-muted-foreground">
              {files.length} scanned image{files.length === 1 ? "" : "s"} will be attached to the receipt.
            </p>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setValues(null)} disabled={busy}>Back</Button>
              <Button
                type="button"
                onClick={() => {
                  if (!values.material_name.trim()) { toast.error("Material name is required"); return; }
                  if (!values.receiver_name.trim()) { toast.error("Receiver name is required"); return; }
                  saveMut.mutate(values);
                }}
                disabled={busy}
              >
                {saveMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                Approve & create receipt
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
