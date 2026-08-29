/**
 * Label printing from inside the intake form.
 *
 * This used to live on the Pending Orders row, but nothing there knows what
 * the vials actually are -- it had to guess the structure from the
 * partner's flat sample list and re-derive ids with its own copy of the
 * numbering rules, which drifted the moment the analyst added, removed, or
 * retyped a vial. Here the ids are the real ones, straight off the live
 * form state, so what prints is what gets saved.
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tags } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { vialBatchId, TEST_TYPE_SHORT } from "@/lib/lims/sample-hierarchy";
import { lotAccent } from "./lot-card";
import type { LotRow } from "./types";

export function CocLabelPrint({
  shipmentId, lots, disabled,
}: {
  shipmentId: string;
  lots: LotRow[];
  disabled: boolean;
}) {
  const navigate = useNavigate();

  // Recomputed on every render from current form state -- add a vial, drop
  // one, or switch a test and this list follows immediately.
  const entries = lots.flatMap((lot, lotIdx) =>
    lot.vials.map((v, vialIdx) => ({
      id: vialBatchId(shipmentId, lotIdx + 1, vialIdx + 1),
      lotNo: lotIdx + 1,
      test: v.test_type,
      // The client's own lot for this vial, falling back to the lot's.
      lotCode: (v.partner_lot || lot.customer_lot || "").trim(),
    })),
  );

  function print() {
    if (!shipmentId || entries.length === 0) {
      toast.error("Add at least one vial before printing labels");
      return;
    }
    const lines = entries.map((e) => (e.lotCode ? `${e.id} / Lot ${e.lotCode}` : e.id));
    try {
      sessionStorage.setItem("vial-labels-pending", lines.join("\n"));
      sessionStorage.setItem("vial-labels-return-to", `${window.location.pathname}${window.location.search}`);
    } catch {
      toast.error("Could not stage labels for printing");
      return;
    }
    void navigate({ to: "/vial-labels" });
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <Label className="text-sm font-semibold">Vial Labels</Label>
          <p className="text-xs text-muted-foreground">
            {entries.length === 0
              ? "No vials yet — labels appear here as you add them."
              : `${entries.length} label${entries.length === 1 ? "" : "s"}, matching the vials below exactly.`}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={print} disabled={disabled || entries.length === 0}>
          <Tags className="size-4 mr-1" /> Print Labels
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => {
            const accent = lotAccent(e.lotNo);
            return (
              <span
                key={e.id}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${accent.band} ${accent.ring}`}
              >
                {e.id}
                <span className="opacity-70">{TEST_TYPE_SHORT[e.test]}</span>
              </span>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Printing leaves this form. Your work is saved as a draft and can be resumed from where you started it.
        </p>
      )}
    </div>
  );
}
