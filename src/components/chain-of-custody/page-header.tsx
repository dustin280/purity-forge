import { Button } from "@/components/ui/button";
import { Plus, Printer, Upload, Send } from "lucide-react";

export function PageHeader({
  onNew,
  onPrintBlank,
  onUploadFilled,
  onOutboundShipment,
  printing,
}: {
  onNew: () => void;
  onPrintBlank: () => void;
  onUploadFilled: () => void;
  onOutboundShipment: () => void;
  printing?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Intake</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Sample Receipt</h1>
        <p className="text-sm text-muted-foreground mt-1">Documented record of every sample received by the lab.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" onClick={onPrintBlank} disabled={printing}>
          <Printer className="size-4 mr-1" /> {printing ? "Preparing…" : "Print Blank CoC"}
        </Button>
        <Button variant="outline" onClick={onUploadFilled}>
          <Upload className="size-4 mr-1" /> Upload / Photo CoC
        </Button>
        <Button variant="outline" onClick={onOutboundShipment}>
          <Send className="size-4 mr-1" /> Outbound Shipment
        </Button>
        <Button onClick={onNew} data-guide="coc-new">
          <Plus className="size-4 mr-1" /> New Sample Receipt
        </Button>
      </div>
    </div>
  );
}
