import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";

interface Props {
  open: boolean;
  synId: string | null;
  onSavePdf: () => void;
  onPrint: () => void;
  onExit: () => void;
}

export function VerifyPrintDialog({ open, synId, onSavePdf, onPrint, onExit }: Props) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onExit(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preparation Verified ✓</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-2">
          <p>
            Saved to the Standard Prep Log{synId ? ` as ` : "."}
            {synId && <span className="font-mono font-semibold">{synId}</span>}
          </p>
          <p className="text-muted-foreground">You can save a PDF, print, or both. Click Exit when done.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={onSavePdf}>
            <FileDown className="size-4 mr-2" /> Save as PDF
          </Button>
          <Button variant="outline" onClick={onPrint}>
            <Printer className="size-4 mr-2" /> Print
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onExit}>Exit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
