import { useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIVE_HISTORY_MINUTES } from "@/components/live-instruments/use-instrument-live-feed";

/**
 * The viewing window shared by every chart on a live page: a length
 * (5/15/30/60 min, default 15) and where its right edge sits. While
 * "following" the edge rides on the newest sample; dragging the slider parks
 * it, "Live" snaps back. Used by the private Live Instruments page and the
 * public /live viewer.
 */

export const WINDOW_OPTIONS = [5, 15, 30, 60].filter((m) => m <= LIVE_HISTORY_MINUTES);
export const DEFAULT_WINDOW_MIN = 15;

export interface Extent {
  /** epoch seconds */
  lo: number;
  hi: number;
}

export function useLiveWindow(extent: Extent | null) {
  const [windowMin, setWindowMin] = useState(DEFAULT_WINDOW_MIN);
  const [follow, setFollow] = useState(true);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const windowS = windowMin * 60;
  const domain = useMemo<[number, number] | null>(() => {
    if (!extent) return null;
    const end =
      follow || viewEnd === null ? extent.hi : Math.min(Math.max(viewEnd, extent.lo), extent.hi);
    return [end - windowS, end];
  }, [extent, follow, viewEnd, windowS]);
  return { windowMin, setWindowMin, follow, setFollow, viewEnd, setViewEnd, domain };
}

export function fmtClock(epochSeconds: number): string {
  return format(epochSeconds * 1000, "HH:mm:ss");
}

export function LiveWindowControls({
  extent,
  win,
  note,
}: {
  extent: Extent | null;
  win: ReturnType<typeof useLiveWindow>;
  /** small status line under the slider (loading history, errors) */
  note?: string | null;
}) {
  const { windowMin, setWindowMin, follow, setFollow, setViewEnd, domain } = win;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Window</span>
          <Select value={String(windowMin)} onValueChange={(v) => setWindowMin(Number(v))}>
            <SelectTrigger className="w-[100px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px] px-1">
          {extent && domain ? (
            <Slider
              min={extent.lo}
              max={extent.hi}
              step={1}
              value={[domain[1]]}
              onValueChange={([v]) => {
                setViewEnd(v);
                setFollow(v >= extent.hi - 1);
              }}
              aria-label="Window position"
            />
          ) : (
            <div className="h-1.5 rounded-full bg-primary/10" />
          )}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground min-w-[9.5rem] text-right">
          {domain ? `${fmtClock(domain[0])} – ${fmtClock(domain[1])}` : "—"}
        </div>
        <Button
          type="button"
          size="sm"
          variant={follow ? "default" : "outline"}
          className="h-8"
          onClick={() => {
            setFollow(true);
            setViewEnd(null);
          }}
        >
          <Radio className="size-3.5" /> Live
        </Button>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {extent ? `Data available ${fmtClock(extent.lo)} – ${fmtClock(extent.hi)}` : "No data yet"}
        {note ? ` · ${note}` : ""}
      </div>
    </div>
  );
}
