import type { Peak } from "@/lib/lims-utils";

/**
 * Parse Agilent-style pasted peak rows. Each line is
 * `rt area area_pct [identity] [sn]` separated by whitespace, commas, or tabs.
 * Returns the parsed peaks and the purity (area % of the largest peak).
 */
export function parsePeaks(text: string): { peaks: Peak[]; purity: number } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: Peak[] = [];
  lines.forEach((line, i) => {
    const cols = line.split(/[\s,;\t]+/);
    const rt = parseFloat(cols[0]);
    const area = parseFloat(cols[1]);
    const pct = parseFloat(cols[2]);
    if (isNaN(rt) || isNaN(area)) return;
    out.push({
      peak_id: `P${i + 1}`,
      rt,
      area,
      area_pct: isNaN(pct) ? 0 : pct,
      identity: cols[3] && isNaN(parseFloat(cols[3])) ? cols[3] : undefined,
      sn: cols[4] ? parseFloat(cols[4]) : undefined,
    });
  });
  const main = out.reduce((a, b) => (b.area_pct > (a?.area_pct ?? 0) ? b : a), out[0]);
  return { peaks: out, purity: main?.area_pct ?? 0 };
}