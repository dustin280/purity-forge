/**
 * Bench Reference cut sheet -- Step D of the Sample Prep redesign. Prompts
 * for a label count, builds the combined label+recipe+record PDF
 * (bench-reference-pdf.ts), and shows it in-dialog with the same "Print /
 * Save as PDF opens the print dialog" convention Quick Dilution already
 * uses (window.print(), here scoped to the embedded preview via an
 * iframe). Stays open for repeat print/save until the analyst clicks
 * "Proceed to Run List", which self-stamps every included record approved
 * (see bench-reference.functions.ts) and navigates on.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Printer, ArrowRight } from "lucide-react";
import { getCutSheetData, approveSamplePrepRecords } from "@/lib/sample-prep/bench-reference.functions";
import { generateBenchReferenceCutSheetPdf } from "@/lib/sample-prep/bench-reference-pdf";

export function BenchReferenceDialog({
  open, onOpenChange, prepIds, analystName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prepIds: string[];
  analystName: string;
}) {
  const navigate = useNavigate();
  const getCutSheet = useServerFn(getCutSheetData);
  const approve = useServerFn(approveSamplePrepRecords);
  const [labelsPerStep, setLabelsPerStep] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bench-reference-cutsheet", prepIds],
    queryFn: () => getCutSheet({ data: { prep_ids: prepIds } }),
    enabled: open && prepIds.length > 0,
  });

  const preparedAt = useMemo(() => new Date().toISOString(), [open]);

  useEffect(() => {
    if (!data?.samples.length) { setPdfUrl(null); return; }
    const doc = generateBenchReferenceCutSheetPdf({
      samples: data.samples, analystName, preparedAt, labelsPerStep,
    });
    const url = doc.output("bloburl").toString();
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, labelsPerStep, analystName]);

  function handlePrint() {
    const frame = document.getElementById("bench-ref-preview") as HTMLIFrameElement | null;
    if (frame?.contentWindow) frame.contentWindow.print();
  }

  const approveMut = useMutation({
    mutationFn: () => approve({ data: { prep_ids: prepIds } }),
    onSuccess: () => {
      toast.success("Samples approved for analysis — proceeding to Run List");
      onOpenChange(false);
      void navigate({ to: "/run-lists/generate" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bench Reference Cut Sheet</DialogTitle>
          <DialogDescription>
            {prepIds.length} sample{prepIds.length === 1 ? "" : "s"}. Print or save the labels and recipe below,
            then proceed to the Run List once you're ready to move these samples into analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="labels-per-step">Labels per step</Label>
            <Input
              id="labels-per-step"
              type="number"
              min={1}
              max={10}
              value={labelsPerStep}
              onChange={(e) => setLabelsPerStep(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="w-24"
            />
          </div>
          <Button type="button" variant="outline" onClick={handlePrint} disabled={!pdfUrl}>
            <Printer className="size-4 mr-1" /> Print / Save as PDF
          </Button>
          <p className="text-xs text-muted-foreground">
            Opens the print dialog — choose "Save as PDF" as the destination. You can print as many times as you need.
          </p>
        </div>

        <div className="border border-border rounded-md overflow-hidden bg-muted/20" style={{ height: "55vh" }}>
          {isLoading && <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Building preview…</div>}
          {!isLoading && pdfUrl && (
            <iframe id="bench-ref-preview" src={pdfUrl} title="Bench Reference cut sheet preview" className="w-full h-full" />
          )}
          {!isLoading && !pdfUrl && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Nothing to preview.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending || !prepIds.length}>
            Proceed to Run List <ArrowRight className="size-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
