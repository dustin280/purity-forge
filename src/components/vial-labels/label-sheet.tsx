/**
 * Printable label sheet matching template R001 / LS-0100F.
 * 8 columns x 20 rows = 160 labels per US Letter page.
 * Each label cell is 1in x 0.5in. Top margin 0.5in, L/R margins 0.25in.
 */

import type React from "react";

export const LABELS_PER_SHEET = 160;
export const COLS = 8;
export const ROWS = 20;

/**
 * Lay out `items` onto sheets. On sheet 1, only cells in
 * [startOffset, endOffset] (inclusive) are eligible to hold a label — cells
 * outside that range are left blank so partially-used sheets can be reused.
 * Overflow continues on subsequent sheets from cell 0.
 */
export function chunkSheets(
  items: string[],
  startOffset: number,
  endOffset: number = LABELS_PER_SHEET - 1,
): string[][] {
  const start = Math.max(0, Math.min(LABELS_PER_SHEET - 1, startOffset));
  const end = Math.max(start, Math.min(LABELS_PER_SHEET - 1, endOffset));
  const sheet1Cap = end - start + 1;

  const firstItems = items.slice(0, sheet1Cap);
  const sheet1: string[] = [
    ...Array(start).fill(""),
    ...firstItems,
    ...Array(LABELS_PER_SHEET - start - firstItems.length).fill(""),
  ];

  const sheets: string[][] = [sheet1];
  const rest = items.slice(sheet1Cap);
  for (let i = 0; i < rest.length; i += LABELS_PER_SHEET) {
    const chunk = rest.slice(i, i + LABELS_PER_SHEET);
    while (chunk.length < LABELS_PER_SHEET) chunk.push("");
    sheets.push(chunk);
  }
  return sheets;
}

type Props = {
  sheets: string[][];
  fontSizePt: number;
  showFooter: boolean;
  showGuides: boolean;
  hAlign?: "left" | "center" | "right";
  vAlign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  bold?: boolean;
  /** Range of cells on sheet 1 to highlight on screen (not printed). */
  highlightRange?: { start: number; end: number } | null;
  /** Optional click handler for cells on sheet 1 (range selection). */
  onCellClick?: (cellIndex: number, e: React.MouseEvent) => void;
};

export function LabelSheets({
  sheets,
  fontSizePt,
  showFooter,
  showGuides,
  hAlign = "center",
  vAlign = "middle",
  wrap = true,
  bold = false,
  highlightRange = null,
  onCellClick,
}: Props) {
  const justifyContent =
    hAlign === "left" ? "flex-start" : hAlign === "right" ? "flex-end" : "center";
  const alignItems =
    vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
  return (
    <div className="vl-print-root">
      {sheets.map((sheet, sIdx) => (
        <div key={sIdx} className="vl-sheet">
          <div className="vl-grid">
            {sheet.map((text, i) => {
              const inRange =
                sIdx === 0 &&
                !!highlightRange &&
                i >= highlightRange.start &&
                i <= highlightRange.end;
              const clickable = sIdx === 0 && !!onCellClick;
              const cls =
                "vl-cell" +
                (showGuides ? " vl-cell-guide" : "") +
                (inRange ? " vl-cell-range" : "") +
                (clickable ? " vl-cell-clickable" : "");
              return (
                <div
                  key={i}
                  className={cls}
                  onClick={clickable ? e => onCellClick!(i, e) : undefined}
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    justifyContent,
                    alignItems,
                    textAlign: hAlign,
                    fontWeight: bold ? 700 : 400,
                    whiteSpace: wrap ? "normal" : "nowrap",
                    wordBreak: wrap ? "break-word" : "normal",
                  }}
                >
                  <span
                    className="vl-cell-text"
                    style={
                      wrap
                        ? undefined
                        : { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }
                    }
                  >
                    {text}
                  </span>
                </div>
              );
            })}
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
