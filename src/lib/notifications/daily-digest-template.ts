/**
 * Pure HTML/text rendering for the daily digest email — no I/O, so it's
 * easy to eyeball via the cron route's dry-run mode without sending
 * anything. Table-based markup with inline styles throughout since email
 * clients (Outlook especially) don't reliably support external/embedded
 * CSS.
 */

export type DigestTier = "new" | "intermediate" | "due_today";

export type DigestItem = {
  sampleId: string;
  client: string;
  project: string | null;
  compound: string | null;
  lot: string | null;
  dueDate: string | null;
  receiptDate: string | null;
  note: string | null;
  tier: DigestTier;
};

export type DigestSection = { key: string; title: string; items: DigestItem[] };

const TIER_STYLE: Record<DigestTier, { bg: string; border: string }> = {
  new: { bg: "#e8f5e9", border: "#43a047" },
  intermediate: { bg: "#fff8e1", border: "#f9a825" },
  due_today: { bg: "#fce4ec", border: "#d81b60" },
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function itemRow(item: DigestItem): string {
  const { bg, border } = TIER_STYLE[item.tier];
  const date = item.dueDate ? `Due ${item.dueDate}` : item.receiptDate ? `Received ${item.receiptDate}` : "";
  return `
    <tr style="background-color:${bg};">
      <td style="padding:8px 12px;border-left:4px solid ${border};font-family:monospace,monospace;font-size:13px;color:#1f2937;border-bottom:1px solid #ffffff;">${esc(item.sampleId)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1f2937;border-bottom:1px solid #ffffff;">${esc(item.client)}${item.project ? ` <span style="color:#6b7280;">(${esc(item.project)})</span>` : ""}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1f2937;border-bottom:1px solid #ffffff;">${esc(item.compound) || "—"}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1f2937;border-bottom:1px solid #ffffff;">${esc(item.lot) || "—"}</td>
      <td style="padding:8px 12px;font-size:12px;color:#374151;border-bottom:1px solid #ffffff;">${esc(date)}${item.note ? `<br/><span style="color:#6b7280;">${esc(item.note)}</span>` : ""}</td>
    </tr>`;
}

function sectionBlock(section: DigestSection): string {
  return `
    <tr><td style="padding:24px 0 8px 0;">
      <div style="font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #111827;padding-bottom:6px;">
        ${esc(section.title)} <span style="color:#6b7280;font-weight:400;text-transform:none;letter-spacing:normal;">(${section.items.length})</span>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
        ${section.items.map(itemRow).join("")}
      </table>
    </td></tr>`;
}

export function renderDigestEmailHtml(recipientName: string, dateISO: string, sections: DigestSection[]): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="background-color:#111827;padding:20px 28px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Synthesyx Lab Manager</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:2px;">Daily Digest — ${esc(dateISO)}</div>
          </td></tr>
          <tr><td style="padding:20px 28px 4px 28px;font-size:14px;color:#374151;">Good morning, ${esc(recipientName)}.</td></tr>
          <tr><td style="padding:0 28px 20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${sections.map(sectionBlock).join("")}
            </table>
          </td></tr>
          <tr><td style="padding:16px 28px;background-color:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
            You're receiving this because you're subscribed to one or more of these categories. Manage your subscriptions on the Daily Digest admin page. syxlab.org
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderDigestTextFallback(sections: DigestSection[]): string {
  return sections
    .map((s) => {
      const lines = s.items
        .map((i) => {
          const date = i.dueDate ? `due ${i.dueDate}` : i.receiptDate ? `received ${i.receiptDate}` : "";
          return `  - ${i.sampleId} — ${i.client}${i.compound ? `, ${i.compound}` : ""}${date ? ` (${date})` : ""}${i.note ? ` [${i.note}]` : ""}`;
        })
        .join("\n");
      return `${s.title} (${s.items.length}):\n${lines || "  (none)"}`;
    })
    .join("\n\n");
}
