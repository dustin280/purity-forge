import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Inbox, ExternalLink, CheckCircle2, XCircle, FileJson, Pencil, Tags } from "lucide-react";
import {
  listPendingOrders, getPendingOrder, cancelPendingOrder, reserveSampleIdForOrder,
} from "@/lib/pending-orders.functions";
import { CocFormDialog } from "@/components/chain-of-custody/coc-form-dialog";
import { EditPendingOrderDialog } from "@/components/pending-orders/edit-order-dialog";
import { saveCocDraft, newDraftId } from "@/lib/coc-drafts";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

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

  const [status, setStatus] = useState<StatusFilter>("pending");
  const [payloadId, setPayloadId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [cocOpen, setCocOpen] = useState(false);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["pending_orders", "list", status],
    queryFn: () => list({ data: { status } }) as Promise<PendingOrder[]>,
  });

  const canCancel = role === "admin" || role === "reviewer";
  const canEdit = role === "admin" || role === "reviewer" || role === "tech";

  async function handleReceive(order: PendingOrder) {
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
      const lineItems = s.map((sm) => ({
        compound: sm.product_name,
        partner_reported_name: sm.product_name,
        lot: sm.lot_batch ?? "",
        catalog: "",
        manufacturer: "",
        quantity: "",
        quantity_unit: "",
        container_size: "",
        concentration: "",
        vial_count: Math.max(1, sm.quantity ?? 1),
        temperature_c: "",
        storage: "",
        requested_tests: [],
        client_received_date: "",
        manufacture_date: "",
        physical_description: sm.notes ?? "",
      }));
      const draftId = newDraftId(`pending-${order.id.slice(0, 8)}`);
      saveCocDraft({
        draftId,
        recordId: null,
        values,
        lineItems,
        pendingFileNames: [],
        updatedAt: new Date().toISOString(),
        summary: `From order ${order.external_order_id}${order.customer_company ? ` · ${order.customer_company}` : ""}`,
        pendingOrderId: order.id,
      });
      setResumeDraftId(draftId);
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
      let seq = 0;
      const lines = detail.samples.flatMap((sm) => {
        const vials = Math.max(1, sm.quantity ?? 1);
        return Array.from({ length: vials }, () => {
          seq += 1;
          const id = `${reserved.reserved_sample_id}-${String(seq).padStart(2, "0")}`;
          return sm.lot_batch ? `${id} / Lot ${sm.lot_batch}` : id;
        });
      });
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
                      <CheckCircle2 className="size-3.5 mr-1" /> Receive
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
            qc.invalidateQueries({ queryKey: ["pending_orders"] });
          }
        }}
        recordId={null}
        resumeDraftId={resumeDraftId}
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