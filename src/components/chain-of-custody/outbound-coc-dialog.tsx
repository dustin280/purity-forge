import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { buildOutboundCocPdf, type OutboundCocLineItem } from "@/lib/outbound-coc-pdf";

function emptyItem(): OutboundCocLineItem {
  return { client: "", clientLot: "", compound: "" };
}

/**
 * Chain of Custody for shipping samples already on-site out to a
 * subcontract lab (heavy metals, or any other outsourced test) — not an
 * intake record, so nothing here is persisted; the PDF itself is the
 * record. See src/lib/outbound-coc-pdf.ts for why this needs its own
 * document instead of reusing the intake CoC.
 */
export function OutboundCocDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [receivingLab, setReceivingLab] = useState("");
  const [requestedTests, setRequestedTests] = useState("");
  const [items, setItems] = useState<OutboundCocLineItem[]>([emptyItem()]);

  function updateItem(i: number, patch: Partial<OutboundCocLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeRow(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const completeItems = items.filter((it) => it.client.trim() && it.clientLot.trim() && it.compound.trim());
  const canGenerate = receivingLab.trim() && requestedTests.trim() && completeItems.length > 0;

  function handleGenerate() {
    if (!canGenerate) {
      toast.error("Receiving lab, requested tests, and at least one complete sample row are required");
      return;
    }
    const doc = buildOutboundCocPdf(receivingLab.trim(), requestedTests.trim(), completeItems);
    doc.save(`Outbound_COC_${receivingLab.trim().replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success(`Generated Chain of Custody for ${completeItems.length} sample${completeItems.length === 1 ? "" : "s"}`);
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setReceivingLab(""); setRequestedTests(""); setItems([emptyItem()]);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outbound Shipment — Chain of Custody</DialogTitle>
          <DialogDescription>
            For samples already on-site being forwarded to a subcontract lab (e.g. heavy metals), before an internal
            Sample ID exists. Nothing here is saved — the downloaded PDF is the record.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Receiving Lab</Label>
            <Input className="mt-1" value={receivingLab} onChange={(e) => setReceivingLab(e.target.value)} placeholder="e.g. LV Cann Labs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Requested Tests</Label>
            <Input className="mt-1" value={requestedTests} onChange={(e) => setRequestedTests(e.target.value)} placeholder="e.g. Heavy Metals — Mercury, Cadmium, Lead, Arsenic" />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label className="text-xs text-muted-foreground">Samples</Label>
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-start">
              <Input
                value={item.client}
                onChange={(e) => updateItem(i, { client: e.target.value })}
                placeholder="Client"
              />
              <Input
                value={item.clientLot}
                onChange={(e) => updateItem(i, { clientLot: e.target.value })}
                placeholder="Client Lot #"
              />
              <Input
                value={item.compound}
                onChange={(e) => updateItem(i, { compound: e.target.value })}
                placeholder="Compound"
              />
              <Button
                type="button" size="icon" variant="ghost"
                onClick={() => removeRow(i)}
                disabled={items.length === 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4 mr-1" /> Add Sample
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
            <Download className="size-4 mr-1" /> Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
