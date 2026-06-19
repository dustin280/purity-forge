/**
 * PDF + print helpers for AI assistant conversations.
 * - buildChatPdf: generates and downloads a PDF using jsPDF.
 * - printChat: renders a print-only block on the current page and calls window.print().
 *   (No window.open / about:blank fallbacks.)
 */
import type { UIMessage } from "ai";

export interface ChatExportMessage {
  role: "user" | "assistant" | "system";
  text: string;
  imageFilenames?: string[];
}

export function uiMessagesToExport(messages: UIMessage[]): ChatExportMessage[] {
  return messages.map((m) => {
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    const imageFilenames = m.parts.flatMap((p) =>
      p.type === "file" && typeof p.mediaType === "string" && p.mediaType.startsWith("image/")
        ? [
            (p as { filename?: string }).filename ??
              (p as { url?: string }).url?.slice(0, 40) ??
              "image",
          ]
        : [],
    );
    return { role: m.role as ChatExportMessage["role"], text, imageFilenames };
  });
}

export function assistantText(messages: UIMessage[]): string {
  return messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""))
    .join("\n\n---\n\n")
    .trim();
}

export async function downloadChatPdf(title: string, messages: ChatExportMessage[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleString(), margin, y);
  y += 18;
  doc.setTextColor(0);

  const line = (text: string, opts: { bold?: boolean; size?: number; color?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 11);
    doc.setTextColor(opts.color ?? 0);
    const wrapped = doc.splitTextToSize(text, maxW);
    for (const w of wrapped) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += (opts.size ?? 11) * 1.25;
    }
  };

  for (const m of messages) {
    if (y > pageH - margin - 40) {
      doc.addPage();
      y = margin;
    }
    line(m.role === "user" ? "YOU" : m.role === "assistant" ? "ADVISOR" : "SYSTEM", {
      bold: true,
      size: 9,
      color: 120,
    });
    y += 2;
    if (m.imageFilenames && m.imageFilenames.length) {
      line(`Attached image(s): ${m.imageFilenames.join(", ")}`, { size: 9, color: 120 });
    }
    if (m.text) line(m.text);
    y += 10;
  }

  doc.save(`${sanitizeFilename(title)}.pdf`);
}

/**
 * Renders a print-only DOM block, calls window.print(), then cleans up.
 * Stays on the same page — no new tab, no popup blocker, no about:blank.
 */
export function printChat(title: string, messages: ChatExportMessage[]) {
  const styleId = "ai-chat-print-style";
  const blockId = "ai-chat-print-block";
  document.getElementById(styleId)?.remove();
  document.getElementById(blockId)?.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @media print {
      body > *:not(#${blockId}) { display: none !important; }
      #${blockId} { display: block !important; padding: 24px; font: 12px/1.45 -apple-system, system-ui, sans-serif; color: #000; }
      #${blockId} h1 { font-size: 18px; margin: 0 0 4px; }
      #${blockId} .meta { color: #666; font-size: 10px; margin-bottom: 16px; }
      #${blockId} .msg { margin-bottom: 14px; page-break-inside: avoid; }
      #${blockId} .role { font-size: 9px; letter-spacing: 0.1em; color: #888; text-transform: uppercase; margin-bottom: 2px; }
      #${blockId} .text { white-space: pre-wrap; }
      #${blockId} .att { font-size: 10px; color: #666; font-style: italic; }
    }
    @media screen { #${blockId} { display: none; } }
  `;
  document.head.appendChild(style);

  const block = document.createElement("div");
  block.id = blockId;
  block.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(new Date().toLocaleString())}</div>
    ${messages
      .map(
        (m) => `
      <div class="msg">
        <div class="role">${m.role === "user" ? "You" : m.role === "assistant" ? "Advisor" : "System"}</div>
        ${m.imageFilenames && m.imageFilenames.length ? `<div class="att">Attached: ${m.imageFilenames.map(escapeHtml).join(", ")}</div>` : ""}
        <div class="text">${escapeHtml(m.text)}</div>
      </div>`,
      )
      .join("")}
  `;
  document.body.appendChild(block);

  const cleanup = () => {
    block.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Defer slightly so the print stylesheet is applied.
  setTimeout(() => window.print(), 50);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "chat";
}