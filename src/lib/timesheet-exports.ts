import { wrapPdf } from "@/lib/pdf-text";
/**
 * CSV + PDF export helpers for timesheet entries. Both download client-side.
 * PDF uses the existing jspdf + jspdf-autotable stack (no new deps).
 */
import type { TimesheetEntry } from "@/lib/timesheets.functions";

function fmtTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function csvEscape(v: string): string {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadTimesheetCsv(entries: TimesheetEntry[], filename: string) {
  const header = ["Date", "Project", "Task", "Start", "End", "Duration (h)", "Notes", "User"];
  const lines = [header.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.entry_date,
        e.project,
        e.task_description,
        fmtTime(e.start_time),
        fmtTime(e.end_time),
        String(e.duration_hours),
        e.notes ?? "",
        e.user_name,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadTimesheetPdf(
  entries: TimesheetEntry[],
  opts: { title: string; subtitle?: string; filename: string },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = wrapPdf(new jsPDF({ orientation: "landscape", compress: true }));

  doc.setFontSize(16);
  doc.text(opts.title, 14, 16);
  doc.setFontSize(10);
  if (opts.subtitle) doc.text(opts.subtitle, 14, 22);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, opts.subtitle ? 27 : 22);

  const total = entries.reduce((s, e) => s + Number(e.duration_hours || 0), 0);

  autoTable(doc, {
    startY: opts.subtitle ? 32 : 27,
    head: [["Date", "User", "Project", "Task", "Start", "End", "Hours", "Notes"]],
    body: entries.map((e) => [
      e.entry_date,
      e.user_name,
      e.project,
      e.task_description,
      fmtTime(e.start_time),
      fmtTime(e.end_time),
      Number(e.duration_hours).toFixed(2),
      e.notes ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 30 },
      2: { cellWidth: 35 },
      3: { cellWidth: 60 },
      4: { cellWidth: 14 },
      5: { cellWidth: 14 },
      6: { cellWidth: 14, halign: "right" },
      7: { cellWidth: "auto" },
    },
    foot: [["", "", "", "", "", "Total", total.toFixed(2), ""]],
    footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: "bold" },
  });

  doc.save(opts.filename);
}