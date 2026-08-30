/**
 * Client-side PDF generator for the Internal Lab Report -- one report per
 * product per CoC submission, covering every sibling vial (see
 * src/lib/lims/coa-data.functions.ts for how those get grouped/queried).
 * Deliberately not called "Certificate of Analysis": this is an internal
 * document, not the customer-facing certificate the partner's own system
 * issues from this app's export API.
 */
import jsPDF from "jspdf";
import { wrapPdf } from "@/lib/pdf-text";
import autoTable from "jspdf-autotable";
import type { Peak } from "./lims-utils";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";
import type { CoaData, CoaVial } from "@/lib/lims/coa-data.functions";

const INK: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [107, 114, 128];
const PASS: [number, number, number] = [5, 150, 105];
const FAIL: [number, number, number] = [220, 38, 38];
const NEUTRAL: [number, number, number] = [55, 65, 81];
const LIGHT_RULE: [number, number, number] = [200, 200, 200];

type Pill = { label: string; tone: "pass" | "fail" | "neutral" };

function toneRgb(tone: Pill["tone"]): [number, number, number] {
  return tone === "pass" ? PASS : tone === "fail" ? FAIL : NEUTRAL;
}

function fmt(n: number | null | undefined, digits = 2): string {
  return n == null || isNaN(n) ? "—" : n.toFixed(digits);
}

function mean(vals: number[]): number | null {
  const v = vals.filter((x) => !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function rsdPct(vals: number[]): number | null {
  const v = vals.filter((x) => !isNaN(x));
  if (v.length < 2) return null;
  const m = mean(v)!;
  if (!m) return null;
  const variance = v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
  return (Math.sqrt(variance) / m) * 100;
}

export function generateCoaPdf(coa: CoaData): jsPDF {
  const doc = wrapPdf(new jsPDF({ unit: "pt", format: "letter", compress: true }));
  const W = doc.internal.pageSize.getWidth();
  const margin = 40;
  const usableW = W - margin * 2;
  const reportDate = new Date().toLocaleDateString();

  // ---------- Letterhead ----------
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 70, "F");
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, 22, 130, 39);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INTERNAL LAB REPORT", W - margin, 34, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`REPORT ${coa.primary.batch_id}  ·  ISSUED ${reportDate}`, W - margin, 46, { align: "right" });
  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  doc.line(margin, 72, W - margin, 72);

  let y = 92;

  // ---------- Product block ----------
  const photoSize = 90;
  let textX = margin;
  if (coa.vialPhoto) {
    try {
      doc.addImage(coa.vialPhoto, margin, y, photoSize, photoSize);
      textX = margin + photoSize + 18;
    } catch {
      /* a malformed data URI must never break the whole report */
    }
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(coa.primary.compound || "—", textX, y + 14);

  const infoY0 = y + 34;
  const colGap = 16;
  const colW = (usableW - (textX - margin) - colGap) / 2;
  const rows: [string, string][] = [
    ["Client", coa.primary.client],
    ["Project", coa.primary.project || "—"],
    ["Physical Form", coa.primary.physical_form || "—"],
    ["Vials Submitted", String(coa.vials.length)],
    ["Date Received", coa.primary.receipt_date],
    ["Date Issued", reportDate],
  ];
  doc.setFontSize(8);
  rows.forEach(([k, v], i) => {
    const col = i % 2;
    const rowY = infoY0 + Math.floor(i / 2) * 26;
    const colX = textX + col * (colW + colGap);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(k.toUpperCase(), colX, rowY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(v, colX, rowY + 11);
  });

  y = Math.max(y + photoSize, infoY0 + Math.ceil(rows.length / 2) * 26 + 4) + 20;

  // ---------- Result Summary badges ----------
  const meanPurity = mean(coa.vials.map((v) => v.result?.purity_percentage ?? NaN));
  const meanLabelPct = mean(
    coa.vials.map((v) => v.targetPeak?.percent_label_claim ?? NaN),
  );
  const identityConforms = coa.vials.length > 0 && coa.vials.every((v) => !!v.targetPeak);
  const sterilityData = coa.sterility?.data as { verdict?: string } | null;
  const endotoxinData = coa.endotoxin?.data as { verdict?: string; result_value?: number | null; result_comparator?: string | null; unit?: string | null } | null;

  const badges: { label: string; value: string; pill: Pill }[] = [
    { label: "IDENTITY", value: identityConforms ? "Conforms" : "Review", pill: { label: identityConforms ? "CONFORMS" : "REVIEW", tone: identityConforms ? "pass" : "fail" } },
    { label: "PURITY", value: meanPurity != null ? `${fmt(meanPurity, 2)} %` : "—", pill: { label: "REPORTED", tone: "neutral" } },
    { label: "CONTENT", value: meanLabelPct != null ? `${fmt(meanLabelPct, 1)} % of label` : "—", pill: { label: "REPORTED", tone: "neutral" } },
    { label: "STERILITY", value: sterilityData?.verdict === "fail" ? "Growth observed" : sterilityData ? "No growth" : "Not tested", pill: { label: sterilityData ? (sterilityData.verdict === "fail" ? "FAIL" : "PASS") : "—", tone: sterilityData?.verdict === "fail" ? "fail" : sterilityData ? "pass" : "neutral" } },
    { label: "ENDOTOXIN", value: endotoxinData ? `${endotoxinData.result_comparator ?? ""}${endotoxinData.result_value ?? "—"} ${endotoxinData.unit ?? ""}` : "Not tested", pill: { label: endotoxinData ? (endotoxinData.verdict === "fail" ? "FAIL" : "PASS") : "—", tone: endotoxinData?.verdict === "fail" ? "fail" : endotoxinData ? "pass" : "neutral" } },
  ];
  const badgeW = usableW / badges.length;
  const badgeH = 54;
  badges.forEach((b, i) => {
    const bx = margin + i * badgeW;
    doc.setDrawColor(...LIGHT_RULE);
    doc.setLineWidth(0.75);
    doc.rect(bx, y, badgeW - 6, badgeH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(b.label, bx + 8, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(b.value, bx + 8, y + 30);
    const pillRgb = toneRgb(b.pill.tone);
    doc.setFillColor(...pillRgb);
    doc.roundedRect(bx + 8, y + 36, 46, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(b.pill.label, bx + 8 + 23, y + 44.5, { align: "center" });
  });
  y += badgeH + 22;

  // ---------- Identity, Purity & Content table ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("IDENTITY, PURITY & CONTENT", margin, y);
  y += 8;

  const vialRows = coa.vials.map((v, i) => [
    String(i + 1).padStart(2, "0"),
    v.targetPeak ? "Conforms" : "Review",
    fmt(v.result?.uv_conf_match ?? null, 0),
    fmt(v.targetPeak?.peak_purity ?? null, 0),
    fmt(v.targetPeak?.rt ?? null, 3),
    fmt(v.result?.purity_percentage ?? null, 2),
    fmt(v.targetPeak?.amount_per_vial_mg ?? null, 2),
    fmt(v.targetPeak?.percent_label_claim ?? null, 1),
    v.appearance || "—",
  ]);
  const meanRow = [
    "MEAN", "",
    fmt(mean(coa.vials.map((v) => v.result?.uv_conf_match ?? NaN)), 0),
    fmt(mean(coa.vials.map((v) => v.targetPeak?.peak_purity ?? NaN)), 0),
    "",
    `${fmt(meanPurity, 2)}  (${fmt(rsdPct(coa.vials.map((v) => v.result?.purity_percentage ?? NaN)), 2)}% RSD)`,
    fmt(mean(coa.vials.map((v) => v.targetPeak?.amount_per_vial_mg ?? NaN)), 2),
    fmt(meanLabelPct, 1),
    "",
  ];
  autoTable(doc, {
    startY: y,
    head: [["Vial", "Identity", "UV Match /1000", "Peak Purity", "RT (min)", "Purity (%)", "Net Peptide (mg)", "% of Label", "Appearance"]],
    body: [...vialRows, meanRow],
    styles: { fontSize: 7.5, font: "helvetica", textColor: INK },
    headStyles: { fillColor: INK, textColor: 255, fontSize: 7 },
    margin: { left: margin, right: margin },
    didParseCell: (hook) => {
      if (hook.row.index === vialRows.length) { hook.cell.styles.fontStyle = "bold"; hook.cell.styles.fillColor = [243, 244, 246]; }
    },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 22;

  // ---------- Chromatogram + Calibration (two columns) ----------
  const primaryVial = coa.vials[0];
  const colGap2 = 20;
  const halfW = (usableW - colGap2) / 2;
  const leftX = margin;
  const rightX = margin + halfW + colGap2;
  const imgH = 150;

  if (primaryVial?.result?.chromatogram_image) {
    try { doc.addImage(primaryVial.result.chromatogram_image, leftX, y, halfW, imgH); } catch { /* skip a bad image, never break the report */ }
  } else {
    doc.setDrawColor(...LIGHT_RULE);
    doc.rect(leftX, y, halfW, imgH);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text("No chromatogram on file", leftX + halfW / 2, y + imgH / 2, { align: "center" });
  }
  if (primaryVial?.result?.calibration_image) {
    try { doc.addImage(primaryVial.result.calibration_image, rightX, y, halfW, imgH); } catch { /* skip a bad image */ }
  } else {
    doc.setDrawColor(...LIGHT_RULE);
    doc.rect(rightX, y, halfW, imgH);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text("No calibration curve on file", rightX + halfW / 2, y + imgH / 2, { align: "center" });
  }
  y += imgH + 8;

  const peaks: Peak[] = primaryVial?.result?.peak_details ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Peak", "RT", "Area", "Purity %"]],
    body: peaks.map((p) => [p.identity || "Unassigned peak", fmt(p.rt, 3), fmt(p.area, 1), fmt(p.area_pct, 2)]),
    styles: { fontSize: 7, font: "helvetica", textColor: INK },
    headStyles: { fillColor: INK, textColor: 255, fontSize: 6.5 },
    margin: { left: leftX, right: W - leftX - halfW },
    tableWidth: halfW,
  });
  const leftTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const metaRows: [string, string][] = [
    ["Instrument", primaryVial?.test?.instrument || "—"],
    ["Wavelength", primaryVial?.result?.wavelength_nm != null ? `${primaryVial.result.wavelength_nm} nm` : "—"],
    ["Analyst", coa.analystName || "—"],
    ["Reviewer", coa.reviewerName || "—"],
  ];
  let metaY = y;
  metaRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold"); doc.setTextColor(...MUTED); doc.setFontSize(7);
    doc.text(k.toUpperCase(), rightX, metaY);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK); doc.setFontSize(8);
    doc.text(v, rightX, metaY + 10);
    metaY += 22;
  });

  y = Math.max(leftTableY, metaY) + 20;
  if (y > doc.internal.pageSize.getHeight() - 160) { doc.addPage(); y = 40; }

  // ---------- Sterility / Endotoxin boxes ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("MICROBIOLOGICAL & ENDOTOXIN TESTING", margin, y);
  y += 10;

  const boxH = 76;
  const boxGap = 20;
  const boxW = (usableW - boxGap) / 2;

  function testBox(x: number, title: string, rowsIn: [string, string][], pill: Pill | null) {
    doc.setDrawColor(...LIGHT_RULE);
    doc.rect(x, y, boxW, boxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(title, x + 10, y + 16);
    if (pill) {
      const rgb = toneRgb(pill.tone);
      doc.setFillColor(...rgb);
      doc.roundedRect(x + boxW - 56, y + 8, 46, 14, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
      doc.text(pill.label, x + boxW - 33, y + 17.5, { align: "center" });
    }
    let ry = y + 32;
    rowsIn.forEach(([k, v]) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(k, x + 10, ry);
      doc.setTextColor(...INK);
      doc.text(v, x + 100, ry);
      ry += 13;
    });
  }

  const sterilityRows: [string, string][] = sterilityData
    ? [["Result", sterilityData.verdict === "fail" ? "Growth observed" : "No growth"], ["Method", (coa.sterility?.data as { method?: string })?.method || "—"]]
    : [["Result", "Not tested"]];
  testBox(margin, "STERILITY  ·  USP <71>", sterilityRows, sterilityData ? { label: sterilityData.verdict === "fail" ? "FAIL" : "PASS", tone: sterilityData.verdict === "fail" ? "fail" : "pass" } : null);

  const endotoxinRows: [string, string][] = endotoxinData
    ? [
        ["Result", `${endotoxinData.result_comparator ?? ""}${endotoxinData.result_value ?? "—"} ${endotoxinData.unit ?? ""}`],
        ["Assay Sensitivity", coa.endotoxinAssaySensitivity != null ? `<${coa.endotoxinAssaySensitivity} EU/mL` : "—"],
        ["Method", (endotoxinData as { method?: string }).method || "—"],
      ]
    : [["Result", "Not tested"]];
  testBox(margin + boxW + boxGap, "BACTERIAL ENDOTOXIN  ·  USP <85>", endotoxinRows, endotoxinData ? { label: endotoxinData.verdict === "fail" ? "FAIL" : "PASS", tone: endotoxinData.verdict === "fail" ? "fail" : "pass" } : null);

  y += boxH + 34;
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 60; }

  // ---------- Footer / sign-off ----------
  doc.setDrawColor(...LIGHT_RULE);
  doc.line(margin, y, margin + 160, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(coa.reviewerName || coa.analystName || "—", margin, y);
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("LABORATORY DIRECTOR", margin, y + 10);

  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  const disclaimer = "Findings apply solely to the sample submitted, as received; handling and storage before arrival lie outside this laboratory's control. For internal use only — not intended as a customer-facing certificate of analysis.";
  const wrapped = doc.splitTextToSize(disclaimer, usableW - 160);
  doc.text(wrapped, margin + 200, y - 4);

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${new Date().toLocaleString()} • Synthesyx • ${coa.primary.batch_id}`, margin, doc.internal.pageSize.getHeight() - 20);

  return doc;
}
