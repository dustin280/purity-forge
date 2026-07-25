import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Printer, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { DilutionCalculator, type DilutionSnapshot } from "./dilution-calculator";

interface Prep {
  id: string;
  title: string;
  snapshot: DilutionSnapshot | null;
}

function newPrep(n: number): Prep {
  return { id: crypto.randomUUID(), title: `Prep ${n}`, snapshot: null };
}

export function DilutionSession() {
  const [sessionName, setSessionName] = useState("");
  const [preps, setPreps] = useState<Prep[]>(() => [newPrep(1)]);
  const printRef = useRef<HTMLDivElement>(null);

  const setSnapshot = useCallback((id: string, s: DilutionSnapshot) => {
    setPreps(prev => prev.map(p => (p.id === id ? { ...p, snapshot: s } : p)));
  }, []);

  function addPrep() {
    setPreps(prev => [...prev, newPrep(prev.length + 1)]);
  }

  function removePrep(id: string) {
    setPreps(prev => (prev.length <= 1 ? prev : prev.filter(p => p.id !== id)));
  }

  function setTitle(id: string, title: string) {
    setPreps(prev => prev.map(p => (p.id === id ? { ...p, title } : p)));
  }

  function handlePrint() {
    window.print();
  }

  function handleExportExcel() {
    const wb = XLSX.utils.book_new();
    const summary: (string | number)[][] = [
      ["Session", sessionName || "Dilution Session"],
      ["Generated", new Date().toLocaleString()],
      [],
      ["#", "Prep", "Type", "Factor", "Stock", "Target", "Diluent", "Steps"],
    ];
    preps.forEach((p, i) => {
      const s = p.snapshot;
      const r = s?.result;
      summary.push([
        i + 1,
        p.title,
        r ? (r.serial ? "Serial" : "Single") : "—",
        r ? `${r.dilutionFactor.toFixed(2)}×` : "—",
        s ? `${s.stock.conc} ${s.stock.massUnit}/${s.stock.volUnit}` : "",
        s ? `${s.target.conc} ${s.target.massUnit}/${s.target.volUnit} in ${s.target.finalVol} ${s.target.finalVolUnit}` : "",
        s?.diluent ?? "",
        r?.steps.length ?? 0,
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

    preps.forEach((p, i) => {
      const r = p.snapshot?.result;
      const rows: (string | number)[][] = [
        ["Prep", p.title],
        ["Diluent", p.snapshot?.diluent ?? ""],
        [],
      ];
      if (r && !r.error) {
        rows.push(["#", "From", "Aliquot", "Diluent", "Final volume", "Resulting concentration"]);
        r.steps.forEach((st, idx) => {
          rows.push([idx + 1, st.fromLabel, st.aliquotDisplay, st.diluentDisplay, st.finalVolDisplay, st.resultConcDisplay]);
        });
        rows.push([]);
        rows.push(["Procedure"]);
        r.procedure.split("\n").forEach(line => rows.push([line]));
      } else if (r?.error) {
        rows.push(["Error", r.error]);
      } else {
        rows.push(["(no result yet)"]);
      }
      const safe = (p.title || `Prep ${i + 1}`).replace(/[\\/*?[\]:]/g, "").slice(0, 28) || `Prep ${i + 1}`;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safe);
    });

    const fname = `${(sessionName || "dilution-session").replace(/\s+/g, "_")}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast.success("Exported to Excel");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3 print:hidden">
        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label>Session name</Label>
            <Input
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g. 2026-03-14 assay working stds"
            />
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="size-4 mr-1" /> Print
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              <FileText className="size-4 mr-1" /> Save PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="size-4 mr-1" /> Export Excel
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground print:hidden">
          "Save PDF" opens the print dialog — choose "Save as PDF" as the destination.
        </p>
      </Card>

      <div ref={printRef} className="space-y-4 print-area">
        {preps.map((p, i) => (
          <div
            key={p.id}
            className={`space-y-1 print:break-inside-avoid ${i < preps.length - 1 ? "print:break-after-page" : ""}`}
          >
            <DilutionCalculator
              title={p.title}
              onTitleChange={t => setTitle(p.id, t)}
              onRemove={preps.length > 1 ? () => removePrep(p.id) : undefined}
              onSnapshot={s => setSnapshot(p.id, s)}
            />
          </div>
        ))}
      </div>

      <div className="print:hidden">
        <Button type="button" variant="outline" onClick={addPrep} className="w-full">
          <Plus className="size-4 mr-1" /> Add another dilution
        </Button>
      </div>
    </div>
  );
}