/**
 * Client-side PDF generator for personal Lab Journal entries.
 * Renders the Synthesyx letterhead, entry metadata, and word-wrapped body
 * with page numbers, matching the look of the CoA/CoC documents.
 */
import jsPDF from "jspdf";
import { wrapPdf } from "@/lib/pdf-text";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export interface JournalPdfInput {
  entry_number: string;
  user_name: string;
  entry_at: string;
  title?: string | null;
  body: string;
  tags?: string[];
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function generateJournalPdf(data: JournalPdfInput): jsPDF {
  const doc = wrapPdf(new jsPDF({ unit: "pt", format: "letter", compress: true }));
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
  doc.text(data.entry_number, margin, y);
  y += 14;
  doc.text(`Author: ${data.user_name}`, margin, y);
  y += 14;
  doc.text(`Date / Time: ${fmt(data.entry_at)}`, margin, y);
  y += 18;

  if (data.tags && data.tags.length) {
    doc.text(`Tags: ${data.tags.map((t) => `#${t}`).join("  ")}`, margin, y);
    y += 18;
  }

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
  doc.save(`${data.entry_number}.pdf`);
}

export interface CombinedJournalPdfInput {
  author: string;
  from: string | null;
  to: string | null;
  tag: string | null;
  entries: JournalPdfInput[];
}

export function downloadCombinedJournalPdf(input: CombinedJournalPdfInput) {
  const doc = wrapPdf(new jsPDF({ unit: "pt", format: "letter", compress: true }));
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;

  const drawHeader = () => {
    doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, 22, 130, 39);
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Lab Journal — Combined", W - margin, 46, { align: "right" });
    doc.setDrawColor(31, 41, 55);
    doc.setLineWidth(1);
    doc.line(margin, 72, W - margin, 72);
  };

  drawHeader();
  let y = 110;
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 41, 55);
  doc.text("Lab Journal", margin, y);
  y += 24;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Author: ${input.author}`, margin, y);
  y += 16;
  const range =
    input.from || input.to
      ? `${input.from || "earliest"} — ${input.to || "latest"}`
      : "All entries";
  doc.text(`Range: ${range}`, margin, y);
  y += 16;
  if (input.tag) {
    doc.text(`Tag filter: #${input.tag}`, margin, y);
    y += 16;
  }
  doc.text(`Entries: ${input.entries.length}`, margin, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString()}  ·  Confidential`,
    margin,
    y,
  );

  const maxWidth = W - margin * 2;
  const lineHeight = 15;
  const bottomLimit = H - 48;

  for (const entry of input.entries) {
    doc.addPage();
    drawHeader();
    let py = 96;

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(
      entry.title?.trim() || "Untitled entry",
      maxWidth,
    ) as string[];
    for (const tl of titleLines) {
      doc.text(tl, margin, py);
      py += 18;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(entry.entry_number, margin, py);
    py += 14;
    doc.text(`Author: ${entry.user_name}`, margin, py);
    py += 14;
    doc.text(`Date / Time: ${fmt(entry.entry_at)}`, margin, py);
    py += 14;
    if (entry.tags && entry.tags.length) {
      doc.text(
        `Tags: ${entry.tags.map((t) => `#${t}`).join("  ")}`,
        margin,
        py,
      );
      py += 14;
    }
    py += 4;
    doc.setDrawColor(220);
    doc.line(margin, py, W - margin, py);
    py += 14;

    doc.setTextColor(20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const paragraphs = (entry.body || "").split(/\n/);
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
      if (py > bottomLimit) {
        doc.addPage();
        drawHeader();
        py = 96;
      }
      doc.text(line, margin, py);
      py += lineHeight;
    }
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${i} of ${total}  ·  Confidential — personal lab journal`,
      W / 2,
      H - 24,
      { align: "center" },
    );
  }

  const fromS = input.from || "all";
  const toS = input.to || "all";
  doc.save(`lab-journal-combined-${fromS}_${toS}.pdf`);
}