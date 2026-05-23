import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function CoaTab({ onDownload, hasResult }: { onDownload: () => void; hasResult: boolean }) {
  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Certificate of Analysis</h3>
          <p className="text-xs text-muted-foreground mt-1">Generates a signed COA PDF with sample, method, peak table, and signature blocks.</p>
        </div>
        <Button onClick={onDownload} disabled={!hasResult}>
          <Download className="size-4 mr-1" />Download COA
        </Button>
      </div>
      {!hasResult && <p className="text-xs text-muted-foreground mt-4">Save a result first to generate the COA.</p>}
    </Card>
  );
}