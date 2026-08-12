/**
 * Dialog for editing a pending (not yet received) partner order: header fields
 * plus its sample lines. The original webhook payload is never modified.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { getPendingOrder, updatePendingOrder } from "@/lib/pending-orders.functions";
import type { Tables } from "@/integrations/supabase/types";

type PendingOrder = Tables<"pending_orders">;
type PendingOrderSample = Tables<"pending_order_samples">;

type Line = {
  id: string | null;
  product_name: string;
  quantity: number;
  lot_batch: string;
  external_sample_id: string;
  notes: string;
};

type Header = {
  external_order_id: string;
  customer_company: string;
  customer_name: string;
  customer_email: string;
  carrier: string;
  tracking_number: string;
  order_date: string;
  expected_arrival: string;
  special_instructions: string;
};

const emptyHeader: Header = {
  external_order_id: "", customer_company: "", customer_name: "", customer_email: "",
  carrier: "", tracking_number: "", order_date: "", expected_arrival: "", special_instructions: "",
};

export function EditPendingOrderDialog({
  orderId, onOpenChange,
}: { orderId: string | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const getOne = useServerFn(getPendingOrder);
  const save = useServerFn(updatePendingOrder);

  const [header, setHeader] = useState<Header>(emptyHeader);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pending_orders", "detail", orderId],
    queryFn: () => getOne({ data: { id: orderId! } }) as Promise<{ order: PendingOrder; samples: PendingOrderSample[] }>,
    enabled: !!orderId,
  });

  useEffect(() => {
    if (!data) return;
    const o = data.order;
    setHeader({
      external_order_id: o.external_order_id ?? "",
      customer_company: o.customer_company ?? "",
      customer_name: o.customer_name ?? "",
      customer_email: o.customer_email ?? "",
      carrier: o.carrier ?? "",
      tracking_number: o.tracking_number ?? "",
      order_date: o.order_date ? o.order_date.slice(0, 10) : "",
      expected_arrival: o.expected_arrival ?? "",
      special_instructions: o.special_instructions ?? "",
    });
    setLines(data.samples.map((s) => ({
      id: s.id,
      product_name: s.product_name ?? "",
      quantity: s.quantity ?? 1,
      lot_batch: s.lot_batch ?? "",
      external_sample_id: s.external_sample_id ?? "",
      notes: s.notes ?? "",
    })));
  }, [data]);

  function setH<K extends keyof Header>(k: K, v: string) {
    setHeader((p) => ({ ...p, [k]: v }));
  }
  function setLine(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    if (!orderId) return;
    if (!header.external_order_id.trim()) { toast.error("Order ID is required"); return; }
    if (lines.some((l) => !l.product_name.trim())) { toast.error("Every sample line needs a product name"); return; }
    setSaving(true);
    try {
      await save({ data: { id: orderId, ...header, samples: lines.map((l) => ({ ...l, quantity: Math.max(1, Number(l.quantity) || 1) })) } });
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["pending_orders"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!orderId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit pending order</DialogTitle>
          <DialogDescription>
            Correct partner-supplied details before receiving. The original webhook payload is preserved for audit.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6">Loading…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Order ID" value={header.external_order_id} onChange={(v) => setH("external_order_id", v)} />
              <Field label="Client company" value={header.customer_company} onChange={(v) => setH("customer_company", v)} />
              <Field label="Contact name" value={header.customer_name} onChange={(v) => setH("customer_name", v)} />
              <Field label="Contact email" value={header.customer_email} onChange={(v) => setH("customer_email", v)} type="email" />
              <Field label="Carrier" value={header.carrier} onChange={(v) => setH("carrier", v)} />
              <Field label="Tracking number" value={header.tracking_number} onChange={(v) => setH("tracking_number", v)} />
              <Field label="Order date" value={header.order_date} onChange={(v) => setH("order_date", v)} type="date" />
              <Field label="Expected arrival" value={header.expected_arrival} onChange={(v) => setH("expected_arrival", v)} type="date" />
            </div>

            <div>
              <Label className="text-xs">Special instructions</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={header.special_instructions}
                onChange={(e) => setH("special_instructions", e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">Samples ({lines.length})</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLines((p) => [...p, { id: null, product_name: "", quantity: 1, lot_batch: "", external_sample_id: "", notes: "" }])}
                >
                  <Plus className="size-3.5 mr-1" /> Add sample
                </Button>
              </div>
              <div className="space-y-2">
                {lines.length === 0 && (
                  <div className="text-xs text-muted-foreground">No sample lines.</div>
                )}
                {lines.map((l, i) => (
                  <div key={l.id ?? `new-${i}`} className="rounded-md border border-border p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-4">
                      <Label className="text-xs">Product</Label>
                      <Input className="mt-1" value={l.product_name} onChange={(e) => setLine(i, { product_name: e.target.value })} />
                    </div>
                    <div className="sm:col-span-3">
                      <Label className="text-xs">Lot / batch</Label>
                      <Input className="mt-1" value={l.lot_batch} onChange={(e) => setLine(i, { lot_batch: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input className="mt-1" type="number" min={1} value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Partner sample ID</Label>
                      <Input className="mt-1" value={l.external_sample_id} onChange={(e) => setLine(i, { external_sample_id: e.target.value })} />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button size="icon" variant="ghost" aria-label="Remove sample"
                        onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="sm:col-span-12">
                      <Label className="text-xs">Notes</Label>
                      <Input className="mt-1" value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
