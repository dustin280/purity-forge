import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Printer, Tags, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { parseListFile } from "@/components/vial-labels/parse-list";
import { LABELS_PER_SHEET, LabelSheets, chunkSheets } from "@/components/vial-labels/label-sheet";

export const Route = createFileRoute("/_authenticated/vial-labels")({
  component: VialLabelsPage,
});

function VialLabelsPage() {
  const [raw, setRaw] = useState("");
  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState(LABELS_PER_SHEET - 1);
  // Tracks which end of the range the next click should set.
  const [clickMode, setClickMode] = useState<"start" | "end">("start");
  const [fontSize, setFontSize] = useState(8);
  const [showFooter, setShowFooter] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [hAlign, setHAlign] = useState<"left" | "center" | "right">("center");
  const [vAlign, setVAlign] = useState<"top" | "middle" | "bottom">("middle");
  const [wrap, setWrap] = useState(true);
  const [bold, setBold] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean),
    [raw],
  );
  const sheets = useMemo(
    () => chunkSheets(items, startOffset, endOffset),
    [items, startOffset, endOffset],
  );

  function handleCellClick(idx: number, e: React.MouseEvent) {
    // Shift-click always sets the end; otherwise alternate start / end so
    // a second click defines the range.
    if (e.shiftKey) {
      setEndOffset(Math.max(startOffset, idx));
      setClickMode("start");
      return;
    }
    if (clickMode === "start") {
      setStartOffset(idx);
      if (idx > endOffset) setEndOffset(idx);
      setClickMode("end");
    } else {
      if (idx < startOffset) {
        setEndOffset(startOffset);
        setStartOffset(idx);
      } else {
        setEndOffset(idx);
      }
      setClickMode("start");
    }
  }

  async function handleFile(file: File) {
    try {
      const parsed = await parseListFile(file);
      setRaw(parsed.join("\n"));
      setFileName(file.name);
      toast.success(`Loaded ${parsed.length} label${parsed.length === 1 ? "" : "s"} from ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not read that file. Try .txt, .csv, or .xlsx.");
    }
  }

  function clearAll() {
    setRaw("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl vl-screen">
        <div className="mb-6 flex items-start gap-3">
          <div className="size-10 rounded-md bg-muted grid place-items-center">
            <Tags className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Labeling</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vial Labels</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a list and print onto Template R001 / LS-0100F label sheets (160 labels per page).
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <Card className="p-5">
            <div className="font-semibold mb-1">1. Upload your list</div>
            <p className="text-sm text-muted-foreground mb-4">
              Accepts <code>.txt</code>, <code>.csv</code>, or <code>.xlsx</code>. One label per line (or first column).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.xlsx,.xls,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Choose file
              </Button>
              {fileName && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  {fileName}
                  <button type="button" onClick={clearAll} className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Clear">
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Labels (editable)</Label>
              <Textarea
                value={raw}
                onChange={e => setRaw(e.target.value)}
                placeholder={"e.g.\nLot 24-001\nLot 24-002\nLot 24-003"}
                className="mt-1 font-mono text-sm min-h-[220px]"
              />
              <div className="text-xs text-muted-foreground mt-2">
                {items.length} label{items.length === 1 ? "" : "s"} · {sheets.length} sheet{sheets.length === 1 ? "" : "s"} ({LABELS_PER_SHEET}/sheet)
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="font-semibold mb-1">2. Options</div>
            <p className="text-sm text-muted-foreground mb-4">
              Tweak placement and appearance, then print.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="vl-offset">Start position (skip first N slots)</Label>
                <Input
                  id="vl-offset"
                  type="number"
                  min={0}
                  max={LABELS_PER_SHEET - 1}
                  value={startOffset}
                  onChange={e => {
                    const v = Math.max(0, Math.min(LABELS_PER_SHEET - 1, Number(e.target.value) || 0));
                    setStartOffset(v);
                    if (v > endOffset) setEndOffset(v);
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">First label cell to print into (0 = top-left).</p>
              </div>
              <div>
                <Label htmlFor="vl-end">End position (last cell used on sheet 1)</Label>
                <Input
                  id="vl-end"
                  type="number"
                  min={0}
                  max={LABELS_PER_SHEET - 1}
                  value={endOffset}
                  onChange={e => {
                    const v = Math.max(0, Math.min(LABELS_PER_SHEET - 1, Number(e.target.value) || 0));
                    setEndOffset(Math.max(startOffset, v));
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Click a cell in the preview to set the start, then another to set the end (or shift-click for end). Overflow continues on the next full sheets.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 -ml-2"
                  onClick={() => { setStartOffset(0); setEndOffset(LABELS_PER_SHEET - 1); setClickMode("start"); }}
                >
                  Reset range to full sheet
                </Button>
              </div>
              <div>
                <Label htmlFor="vl-font">Font size (pt)</Label>
                <Input
                  id="vl-font"
                  type="number"
                  min={4}
                  max={14}
                  step={0.5}
                  value={fontSize}
                  onChange={e => setFontSize(Math.max(4, Math.min(14, Number(e.target.value) || 8)))}
                />
                <p className="text-xs text-muted-foreground mt-1">Default 8pt. Lower for long text.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Horizontal align</Label>
                  <div className="mt-1 inline-flex rounded-md border bg-background p-0.5">
                    {(["left", "center", "right"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHAlign(v)}
                        className={`px-3 py-1 text-xs rounded ${hAlign === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {v[0].toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Vertical align</Label>
                  <div className="mt-1 inline-flex rounded-md border bg-background p-0.5">
                    {(["top", "middle", "bottom"] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVAlign(v)}
                        className={`px-3 py-1 text-xs rounded ${vAlign === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {v[0].toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="vl-wrap" type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} />
                <Label htmlFor="vl-wrap" className="cursor-pointer">Word wrap (off = single line, truncated with ellipsis)</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="vl-bold" type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} />
                <Label htmlFor="vl-bold" className="cursor-pointer">Bold text</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="vl-footer" type="checkbox" checked={showFooter} onChange={e => setShowFooter(e.target.checked)} />
                <Label htmlFor="vl-footer" className="cursor-pointer">Show template footer</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="vl-guides" type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} />
                <Label htmlFor="vl-guides" className="cursor-pointer">Show cell guides on screen (hidden when printing)</Label>
              </div>
              <Button onClick={handlePrint} className="w-full" size="lg">
                <Printer className="size-4" /> Preview & Print
              </Button>
              <p className="text-xs text-muted-foreground">
                The browser print dialog acts as the preview. Set margins to <strong>None</strong> and scaling to <strong>100%</strong> for accurate alignment.
              </p>
            </div>
          </Card>
        </div>

        {items.length > 0 && (
          <Card className="p-4 mb-6 vl-live">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold">Live preview</div>
                <div className="text-xs text-muted-foreground">
                  Sheet 1 of {sheets.length} · cells {startOffset}–{endOffset} selected · click a cell to set {clickMode === "start" ? "start" : "end"} (shift-click for end).
                </div>
              </div>
            </div>
            <div className="vl-live-frame">
              <div className="vl-live-scale">
                <LabelSheets
                  sheets={sheets.slice(0, 1)}
                  fontSizePt={fontSize}
                  showFooter={showFooter}
                  showGuides={showGuides}
                  hAlign={hAlign}
                  vAlign={vAlign}
                  wrap={wrap}
                  bold={bold}
                  highlightRange={{ start: startOffset, end: endOffset }}
                  onCellClick={handleCellClick}
                />
              </div>
            </div>
          </Card>
        )}

        <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Full print preview</div>
      </div>

      <div className="vl-preview-wrap px-4 sm:px-6 lg:px-8 pb-12">
        <LabelSheets
          sheets={sheets}
          fontSizePt={fontSize}
          showFooter={showFooter}
          showGuides={showGuides}
          hAlign={hAlign}
          vAlign={vAlign}
          wrap={wrap}
          bold={bold}
          highlightRange={{ start: startOffset, end: endOffset }}
          onCellClick={handleCellClick}
        />
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div className="vl-print-portal">
            <LabelSheets
              sheets={sheets}
              fontSizePt={fontSize}
              showFooter={showFooter}
              showGuides={showGuides}
              hAlign={hAlign}
              vAlign={vAlign}
              wrap={wrap}
              bold={bold}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

const PRINT_CSS = `
.vl-print-root { display: flex; flex-direction: column; gap: 1.5rem; align-items: center; }
.vl-sheet {
  width: 8.5in;
  height: 11in;
  padding: 0.5in 0.25in 0 0.25in;
  box-sizing: border-box;
  background: #fff;
  color: #000;
  position: relative;
  box-shadow: 0 1px 6px rgba(0,0,0,0.18);
}
.vl-grid {
  display: grid;
  grid-template-columns: repeat(8, 1in);
  grid-template-rows: repeat(20, 0.5in);
  width: 8in;
  height: 10in;
}
.vl-cell {
  width: 1in;
  height: 0.5in;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  padding: 1px 2px;
  box-sizing: border-box;
  line-height: 1.05;
  word-break: break-word;
}
.vl-cell-text {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.vl-cell-guide { outline: 1px dashed rgba(0,0,0,0.18); outline-offset: -1px; }
.vl-cell-clickable { cursor: pointer; }
.vl-cell-clickable:hover { background: rgba(59,130,246,0.08); }
.vl-cell-range { background: rgba(59,130,246,0.18); outline: 1px solid rgba(59,130,246,0.55); outline-offset: -1px; }
.vl-live-frame {
  width: 100%;
  overflow: auto;
  background: oklch(0.96 0 0);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  justify-content: center;
}
.vl-live-scale {
  transform: scale(0.6);
  transform-origin: top center;
  width: 8.5in;
  height: calc(11in * 0.6);
}
@media (max-width: 900px) {
  .vl-live-scale { transform: scale(0.4); height: calc(11in * 0.4); }
}
.vl-footer {
  position: absolute;
  bottom: 0.15in;
  left: 0; right: 0;
  text-align: center;
  font-size: 9pt;
  color: #000;
  letter-spacing: 0.02em;
}
@media print {
  @page { size: 8.5in 11in; margin: 0; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body > *:not(.vl-print-portal) { display: none !important; }
  .vl-print-portal { display: block !important; margin: 0 !important; padding: 0 !important; }
  .vl-print-root { gap: 0; }
  .vl-sheet {
    box-shadow: none !important;
    page-break-after: always;
    break-after: page;
  }
  .vl-sheet:last-child { page-break-after: auto; break-after: auto; }
  .vl-cell-guide { outline: none !important; }
  .vl-cell-range { background: transparent !important; outline: none !important; }
}
.vl-print-portal { display: none; }
`;