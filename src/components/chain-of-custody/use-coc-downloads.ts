import { useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCocRecord } from "@/lib/lims.functions";
import { buildCocPdf, safeFileName, type CocFieldLite } from "@/lib/coc-pdf";
import type { CocField, CocRecord } from "./types";

export function useCocDownloads(fields: CocField[]) {
  const getRec = useServerFn(getCocRecord);
  const [downloading, setDownloading] = useState(false);

  const fieldsForPdf: CocFieldLite[] = useMemo(
    () => fields.map(f => ({ field_key: f.field_key, label: f.label })),
    [fields]
  );

  const downloadOne = useCallback(async (id: string) => {
    try {
      const rec = (await getRec({ data: { id } })) as CocRecord;
      const doc = buildCocPdf(rec, fieldsForPdf);
      doc.save(`COC_${safeFileName(rec.sample_id)}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download");
    }
  }, [getRec, fieldsForPdf]);

  const downloadSelected = useCallback(async (selected: Set<string>) => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const ids = Array.from(selected);
      if (ids.length === 1) {
        await downloadOne(ids[0]);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const id of ids) {
          const rec = (await getRec({ data: { id } })) as CocRecord;
          const doc = buildCocPdf(rec, fieldsForPdf);
          zip.file(`COC_${safeFileName(rec.sample_id)}_${id.slice(0, 8)}.pdf`, doc.output("blob"));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chain-of-custody-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(`Downloaded ${ids.length} record${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk download failed");
    } finally {
      setDownloading(false);
    }
  }, [getRec, fieldsForPdf, downloadOne]);

  return { downloading, downloadOne, downloadSelected };
}
