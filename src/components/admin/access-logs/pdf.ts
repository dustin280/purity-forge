import { jsPDF } from "jspdf";
import type { AccessLog, AccessLogsSummary } from "./types";

export function downloadAccessLogsPdf(args: {
  rows: AccessLog[];
  from: string;
  to: string;
  summary: AccessLogsSummary;
}) {
  const { rows, from, to, summary } = args;
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Access Logs", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Range: ${from} to ${to}`, margin, y);
  doc.text(
    `Total: ${summary.total}  •  Logins: ${summary.logins}  •  Logouts: ${summary.logouts}`,
    pageW - margin, y, { align: "right" }
  );
  y += 14;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setTextColor(0);

  const cols = [
    { label: "Timestamp", w: 130 },
    { label: "User", w: 140 },
    { label: "Email", w: 170 },
    { label: "Event", w: 60 },
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let x = margin;
  for (const c of cols) { doc.text(c.label, x, y); x += c.w; }
  y += 10;
  doc.setDrawColor(220);
  doc.line(margin, y, pageW - margin, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const r of rows) {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    let cx = margin;
    const cells = [
      new Date(r.created_at).toLocaleString(),
      r.user_name ?? "—",
      r.user_email ?? "—",
      r.event,
    ];
    cells.forEach((val, i) => {
      const w = cols[i].w - 6;
      const lines = doc.splitTextToSize(String(val ?? "—"), w);
      doc.text(lines, cx, y);
      cx += cols[i].w;
    });
    y += 14;
  }

  doc.save(`access-logs-${from}_to_${to}.pdf`);
}