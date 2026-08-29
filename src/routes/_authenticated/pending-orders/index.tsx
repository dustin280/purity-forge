import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Inbox, ExternalLink, CheckCircle2, XCircle, FileJson, Pencil, Tags, ClipboardList, Trash2 } from "lucide-react";
import {
  listPendingOrders, getPendingOrder, cancelPendingOrder, reserveSampleIdForOrder,
} from "@/lib/pending-orders.functions";
import { releaseSampleId } from "@/lib/lims/coc/coc-records.functions";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import type { CocFormSeed } from "@/components/chain-of-custody/use-coc-form";
import { EditPendingOrderDialog } from "@/components/pending-orders/edit-order-dialog";
import { deleteCocDraft } from "@/lib/coc-drafts";
import { deleteDraftFiles } from "@/lib/coc-draft-files";
import { useCocDrafts } from "@/components/chain-of-custody/use-coc-drafts";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";
import { emptyLot, emptyVial, type LotRow } from "@/components/chain-of-custody/types";
import { baseLot, partnerTestType, stripVialTag, vialBatchId, sortVialsByTest } from "@/lib/lims/sample-hierarchy";

/** The shape the partner posts to /api/public/orders/intake, per sample. */
type PartnerRawSample = {
  lotBatch?: string | null;
  productName?: string | null;
  quantity?: number | null;
  components?: Array<{ compound?: string | null; mg?: number | null }>;
};

type PendingOrder = Tables<"pending_orders">;
type PendingOrderSample = Tables<"pending_order_samples">;

type StatusFilter = "pending" | "received" | "cancelled" | "all";

export const Route = createFileRoute("/_authenticated/pending-orders/")({
  component: PendingOrdersPage,
});

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDateOnly(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    received: { label: "Received", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function PendingOrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const list = useServerFn(listPendingOrders);
  const getOne = useServerFn(getPendingOrder);
  const cancel = useServerFn(cancelPendingOrder);
  const reserveId = useServerFn(reserveSampleIdForOrder);
  const releaseId = useServerFn(releaseSampleId);

  const [status, setStatus] = useState<StatusFilter>("pending");
  const [payloadId, setPayloadId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [cocOpen, setCocOpen] = useState(false);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [seed, setSeed] = useState<CocFormSeed | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["pending_orders", "list", status],
    queryFn: () => list({ data: { status } }) as Promise<PendingOrder[]>,
  });

  const canCancel = role === "admin" || role === "reviewer";
  const canEdit = role === "admin" || role === "reviewer" || role === "tech";

  const drafts = useCocDrafts();
  const draftByOrderId = useMemo(
    () => new Map(drafts.filter(d => d.pendingOrderId).map(d => [d.pendingOrderId as string, d])),
    [drafts],
  );

  async function handleReceive(order: PendingOrder) {
    // A draft already in progress for this order lives here, not a fresh
    // one — resuming it (rather than always minting a new draft id) is
    // what keeps "drafts live where they were initiated" true even across
    // repeated clicks.
    const existing = draftByOrderId.get(order.id);
    if (existing) {
      setSeed(null);
      setResumeDraftId(existing.draftId);
      setCocOpen(true);
      return;
    }
    try {
      const [detail, reserved] = await Promise.all([
        getOne({ data: { id: order.id } }) as Promise<{ order: PendingOrder; samples: PendingOrderSample[] }>,
        reserveId({ data: { id: order.id } }),
      ]);
      const s = detail.samples;
      const values: Record<string, string | string[]> = {
        sample_id: reserved.reserved_sample_id,
        client_company: order.customer_company ?? "",
        client_contact_name: order.customer_name ?? "",
        client_contact_email: order.customer_email ?? "",
        shipping_method: order.carrier ?? "",
        tracking_number: order.tracking_number ?? "",
        shipment_date: order.order_date ? order.order_date.slice(0, 10) : "",
        receipt_datetime: new Date().toISOString().slice(0, 16),
        comments: order.special_instructions ?? "",
      };
      // The partner sends one flat entry per physical vial, each tagged with
      // its test via BOTH a lot suffix (-EN/-ST/-HM) and a product-name
      // bracket tag. Fold those back into the lot -> vial hierarchy: group
      // by base lot, and turn each of their entries into a typed vial.
      const rawSamples = (detail.order.raw_payload as { samples?: PartnerRawSample[] } | null)?.samples ?? [];
      const rawByLotBatch = new Map(rawSamples.filter(r => r.lotBatch).map(r => [r.lotBatch as string, r]));

      const lotsByBase = new Map<string, LotRow>();
      for (const sm of s) {
        const base = baseLot(sm.lot_batch) || sm.product_name;
        const raw = sm.lot_batch ? rawByLotBatch.get(sm.lot_batch) : undefined;
        let lot = lotsByBase.get(base);
        if (!lot) {
          // Their `components` array is already structured ({compound, mg}),
          // so every compound and mass comes across directly -- no parsing
          // of the concatenated product name needed for partner orders, and
          // no compound gets singled out as "primary".
          const comps = raw?.components ?? [];
          const components = comps.length
            ? comps.map((c) => ({
                compound_id: null,
                compound: c.compound ?? "",
                label_content_value: c.mg != null ? String(c.mg) : "",
                label_content_unit: (c.mg != null ? "mg" : "") as "" | "mg" | "ug",
              }))
            // No structured components (a hand-entered order): fall back to
            // the product name as a single unpriced compound rather than
            // inventing amounts.
            : [{ compound_id: null, compound: stripVialTag(sm.product_name), label_content_value: "", label_content_unit: "" as const }];
          lot = {
            ...emptyLot(),
            // Their exact string, kept verbatim as the reference the
            // components above were read from.
            partner_reported_name: sm.product_name,
            customer_lot: base,
            physical_form: "solid",
            is_multi_component: components.length > 1,
            components,
            vials: [],
          };
          lotsByBase.set(base, lot);
        }
        const target = lot!;
        const testType = partnerTestType(sm.lot_batch, sm.product_name) ?? "purity";
        // One vial per unit they sent, each keeping their exact per-vial lot
        // string -- their export API is polled by that value.
        for (let i = 0; i < Math.max(1, sm.quantity ?? 1); i++) {
          target.vials.push({
            ...emptyVial(testType),
            partner_lot: sm.lot_batch ?? "",
          });
        }
      }
      const lineItems = Array.from(lotsByBase.values()).map(l => ({
        ...l,
        // Canonical test order, not the order the partner happened to list
        // them in -- their entries arrive base/-ST/-EN, which would number
        // sterility before endotoxin.
        vials: sortVialsByTest(l.vials.length ? l.vials : [emptyVial("purity")]),
      }));
      // Hand the pre-fill to the dialog in memory rather than persisting a
      // draft up front. Opening the form to look at an order shouldn't
      // leave a draft behind -- the autosave writes one as soon as
      // anything is actually edited.
      setResumeDraftId(null);
      setSeed({ values, lots: lineItems, pendingOrderId: order.id, seedKey: order.id });
      setCocOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open order");
    }
  }

  async function handlePrintLabels(order: PendingOrder) {
    setPrintingId(order.id);
    try {
      const [detail, reserved] = await Promise.all([
        getOne({ data: { id: order.id } }) as Promise<{ order: PendingOrder; samples: PendingOrderSample[] }>,
        reserveId({ data: { id: order.id } }),
      ]);
      // Must mirror the intake numbering exactly (lot -> vial), or the
      // printed labels won't match the ids the receive flow assigns.
      const labelLotOrder: string[] = [];
      const labelVialsByLot = new Map<string, { lotBatch: string | null }[]>();
      for (const sm of detail.samples) {
        const base = baseLot(sm.lot_batch) || sm.product_name;
        if (!labelVialsByLot.has(base)) { labelVialsByLot.set(base, []); labelLotOrder.push(base); }
        for (let i = 0; i < Math.max(1, sm.quantity ?? 1); i++) {
          labelVialsByLot.get(base)!.push({ lotBatch: sm.lot_batch });
        }
      }
      const lines = labelLotOrder.flatMap((base, lotIdx) =>
        (labelVialsByLot.get(base) ?? []).map((v, vialIdx) => {
          const id = vialBatchId(reserved.reserved_sample_id, lotIdx + 1, vialIdx + 1);
          return v.lotBatch ? `${id} / Lot ${v.lotBatch}` : id;
        }));
      if (lines.length === 0) {
        toast.info("No sample lines to label on this order.");
        return;
      }
      sessionStorage.setItem("vial-labels-pending", lines.join("\n"));
      sessionStorage.setItem("vial-labels-return-to", `${window.location.pathname}${window.location.search}`);
      navigate({ to: "/vial-labels" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to prepare labels");
    } finally {
      setPrintingId(null);
    }
  }

  async function handleCancel(order: PendingOrder) {
    if (!confirm(`Cancel order ${order.external_order_id}? Its raw payload is retained for audit.`)) return;
    try {
      await cancel({ data: { id: order.id } });
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["pending_orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Partner Intake</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Pending Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders forwarded by partner sites awaiting physical arrival at the lab. When the shipment arrives, click Receive to open a pre-filled Sample Receipt.
        </p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-8 mx-auto mb-2 opacity-40" />
            No {status === "all" ? "" : status} orders.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{o.external_order_id}</span>
                    <StatusBadge status={o.status} />
                    <Badge variant="outline" className="text-xs">
                      {o.total_samples ?? "?"} sample{(o.total_samples ?? 0) === 1 ? "" : "s"}
                    </Badge>
                    {draftByOrderId.has(o.id) && (
                      <Badge variant="secondary" className="text-xs">
                        <ClipboardList className="size-3 mr-1" /> Draft in progress
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {o.customer_company ?? "Unknown client"}
                    {o.customer_name ? ` · ${o.customer_name}` : ""}
                    {" · Ordered "}{fmtDate(o.order_date)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.carrier ?? "Carrier ?"} {o.tracking_number ? `· ${o.tracking_number}` : ""}
                    {o.expected_arrival ? ` · ETA ${fmtDateOnly(o.expected_arrival)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {o.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => handlePrintLabels(o)} disabled={printingId === o.id}>
                      <Tags className="size-3.5 mr-1" /> {printingId === o.id ? "Preparing…" : "Print Labels"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPayloadId(o.id)}>
                    <FileJson className="size-3.5 mr-1" /> Payload
                  </Button>
                  {o.status === "pending" && (
                    <Button size="sm" onClick={() => handleReceive(o)}>
                      <CheckCircle2 className="size-3.5 mr-1" /> {draftByOrderId.has(o.id) ? "Resume Draft" : "Receive"}
                    </Button>
                  )}
                  {o.status === "pending" && draftByOrderId.has(o.id) && (
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => {
                        const d = draftByOrderId.get(o.id);
                        if (!d) return;
                        if (!confirm("Discard this draft? The order stays pending and can be received fresh.")) return;
                        deleteCocDraft(d.draftId);
                        void deleteDraftFiles(d.draftId);
                        // The order keeps its reservation (it's still
                        // pending), so nothing to release here -- receiving
                        // it again reuses the same id.
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      title="Discard draft"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  {o.status === "pending" && canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setEditId(o.id)}>
                      <Pencil className="size-3.5 mr-1" /> Edit
                    </Button>
                  )}
                  {o.status === "received" && o.linked_coc_id && (
                    <Badge variant="outline" className="text-xs">
                      <ExternalLink className="size-3 mr-1" /> Linked
                    </Badge>
                  )}
                  {o.status === "pending" && canCancel && (
                    <Button size="sm" variant="outline" onClick={() => handleCancel(o)}>
                      <XCircle className="size-3.5 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PayloadDialog
        id={payloadId}
        onOpenChange={(v) => { if (!v) setPayloadId(null); }}
      />

      <EditPendingOrderDialog
        orderId={editId}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
      />

      <CocFormDialog
        open={cocOpen}
        onOpenChange={(v) => {
          setCocOpen(v);
          if (!v) {
            setResumeDraftId(null);
            setSeed(null);
            qc.invalidateQueries({ queryKey: ["pending_orders"] });
          }
        }}
        recordId={null}
        resumeDraftId={resumeDraftId}
        seed={seed}
      />
    </div>
  );
}

function PayloadDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (v: boolean) => void }) {
  const getOne = useServerFn(getPendingOrder);
  const { data } = useQuery({
    queryKey: ["pending_orders", "detail", id],
    queryFn: () => getOne({ data: { id: id! } }) as Promise<{ order: PendingOrder; samples: PendingOrderSample[] }>,
    enabled: !!id,
  });
  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raw webhook payload</DialogTitle>
          <DialogDescription className="sr-only">
            Raw JSON payload received from the partner webhook
          </DialogDescription>
        </DialogHeader>
        {data ? (
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(data.order.raw_payload, null, 2)}
          </pre>
        ) : (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}