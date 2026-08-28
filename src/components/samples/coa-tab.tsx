import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { getCoaData } from "@/lib/lims/coa-data.functions";
import { generateCoaPdf } from "@/lib/coa-pdf";

export function CoaTab({ sampleId, hasResult }: { sampleId: string; hasResult: boolean }) {
  const getCoaDataFn = useServerFn(getCoaData);
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      const coa = await getCoaDataFn({ data: { sampleId } });
      const pdf = generateCoaPdf(coa);
      pdf.save(`ILR_${coa.primary.batch_id}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Internal Lab Report</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Generates a report covering every vial of this product — identity, purity, content, chromatogram, and sterility/endotoxin summary.
          </p>
        </div>
        <Button onClick={onDownload} disabled={!hasResult || busy}>
          <Download className="size-4 mr-1" />{busy ? "Generating…" : "Download Report"}
        </Button>
      </div>
      {!hasResult && <p className="text-xs text-muted-foreground mt-4">Save a result first to generate the report.</p>}
    </Card>
  );
}
