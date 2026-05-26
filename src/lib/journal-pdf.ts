/**
 * Client-side PDF generator for personal Lab Journal entries.
 * Renders the Synthesyx letterhead, entry metadata, and word-wrapped body
 * with page numbers, matching the look of the CoA/CoC documents.
 */
import jsPDF from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export interface JournalPdfInput {
  user_name: string;
  entry_at: string;
  title?: string | null;
  body: string;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function generateJournalPdf(data: JournalPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;

  const drawHeader = () => {
    doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, 22, 130, 39);
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Lab Journal", W - margin, 46, { align: "right" });
    doc.setDrawColor(31, 41, 55);
    doc.setLineWidth(1);
    doc.line(margin, 72, W - margin, 72);
  };

  const drawFooter = (page: number, total: number) => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${page} of ${total}  ·  Confidential — personal lab journal`,
      W / 2,
      H - 24,
      { align: "center" },
    );
  };

  drawHeader();

  let y = 96;
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.title?.trim() || "Lab Journal Entry", margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Author: ${data.user_name}`, margin, y);
  y += 14;
  doc.text(`Date / Time: ${fmt(data.entry_at)}`, margin, y);
  y += 18;

  doc.setDrawColor(220);
  doc.line(margin, y, W - margin, y);
  y += 18;

  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const maxWidth = W - margin * 2;
  const lineHeight = 15;
  const bottomLimit = H - 48;

  // Preserve paragraph breaks, then wrap each paragraph.
  const paragraphs = (data.body || "").split(/\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (p.length === 0) {
      lines.push("");
      continue;
    }
    const wrapped = doc.splitTextToSize(p, maxWidth) as string[];
    lines.push(...wrapped);
  }

  for (const line of lines) {
    if (y > bottomLimit) {
      doc.addPage();
      drawHeader();
      y = 96;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawFooter(i, total);
  }

  return doc;
}

export function downloadJournalPdf(data: JournalPdfInput) {
  const doc = generateJournalPdf(data);
  const date = data.entry_at.slice(0, 10);
  const slug = (data.title || "entry")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "entry";
  doc.save(`lab-journal-${date}-${slug}.pdf`);
}