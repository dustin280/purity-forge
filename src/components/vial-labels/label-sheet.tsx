/**
 * Printable label sheet matching template R001 / LS-0100F.
 * 8 columns x 20 rows = 160 labels per US Letter page.
 * Each label cell is 1in x 0.5in. Top margin 0.5in, L/R margins 0.25in.
 */

export const LABELS_PER_SHEET = 160;
export const COLS = 8;
export const ROWS = 20;

export function chunkSheets(items: string[], startOffset: number): string[][] {
  const padded = [...Array(Math.max(0, startOffset)).fill(""), ...items];
  const sheets: string[][] = [];
  for (let i = 0; i < padded.length; i += LABELS_PER_SHEET) {
    const chunk = padded.slice(i, i + LABELS_PER_SHEET);
    while (chunk.length < LABELS_PER_SHEET) chunk.push("");
    sheets.push(chunk);
  }
  return sheets.length ? sheets : [Array(LABELS_PER_SHEET).fill("")];
}

type Props = {
  sheets: string[][];
  fontSizePt: number;
  showFooter: boolean;
  showGuides: boolean;
};

export function LabelSheets({ sheets, fontSizePt, showFooter, showGuides }: Props) {
  return (
    <div className="vl-print-root">
      {sheets.map((sheet, sIdx) => (
        <div key={sIdx} className="vl-sheet">
          <div className="vl-grid">
            {sheet.map((text, i) => (
              <div
                key={i}
                className={`vl-cell ${showGuides ? "vl-cell-guide" : ""}`}
                style={{ fontSize: `${fontSizePt}pt` }}
              >
                <span className="vl-cell-text">{text}</span>
              </div>
            ))}
          </div>
          {showFooter && (
            <div className="vl-footer">
              THESHIPPINGSTORE.COM&nbsp;&nbsp;-&nbsp;&nbsp;<strong>TEMPLATE R001</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}