import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkflowGuide } from "@/contexts/workflow-guide-context";
import { WORKFLOW_GUIDES } from "@/lib/workflow-guides";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_GAP = 12;
const VIEWPORT_MARGIN = 16;

/** Places the card beside its target (below, or above if there's no room),
 * clamped to the viewport — falls back to bottom-right when there's no
 * target (e.g. a DONE_STEP) so it never has to guess a position. */
function cardStyleFor(rect: Rect | null, size: { width: number; height: number } | null): CSSProperties {
  if (!rect || !size) return { bottom: VIEWPORT_MARGIN, right: VIEWPORT_MARGIN };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const top = spaceBelow >= size.height + CARD_GAP || spaceBelow >= spaceAbove
    ? Math.min(rect.top + rect.height + CARD_GAP, vh - size.height - VIEWPORT_MARGIN)
    : Math.max(rect.top - size.height - CARD_GAP, VIEWPORT_MARGIN);
  const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), vw - size.width - VIEWPORT_MARGIN);
  return { top, left };
}

function useTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const interval = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [selector]);

  return rect;
}

export function GuideOverlay() {
  const { activeWorkflow, currentStep, stepIndex, totalSteps, exitWorkflow, nextStep } = useWorkflowGuide();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const rect = useTargetRect(currentStep?.targetSelector ?? null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      setCardSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeWorkflow, currentStep]);


  if (!activeWorkflow || !currentStep) return null;
  const guide = WORKFLOW_GUIDES[activeWorkflow];
  const isDoneStep = currentStep.targetSelector === null;
  const onRightPage = pathname === currentStep.route || pathname.startsWith(`${currentStep.route}/`);

  return (
    <>
      {rect && (
        <div
          className="fixed z-[70] pointer-events-none rounded-md ring-2 ring-primary animate-pulse"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow:
              "0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent), 0 0 24px 4px color-mix(in oklab, var(--primary) 35%, transparent)",
          }}
        />
      )}

      <div
        ref={cardRef}
        className="fixed z-[71] w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card shadow-lg"
        style={cardStyleFor(rect, cardSize)}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Compass className="size-3" /> {guide.label}
          </div>
          <button
            onClick={exitWorkflow}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1"
            aria-label="Exit tour"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="px-4 pt-1 pb-4 space-y-2">
          <div className="text-[10px] text-muted-foreground">Step {stepIndex + 1} of {totalSteps}</div>
          <div className="text-sm font-semibold">{currentStep.title}</div>
          <p className="text-xs text-muted-foreground leading-relaxed">{currentStep.description}</p>
          <div className="flex items-center gap-2 pt-1">
            {!onRightPage && !isDoneStep && (
              <Button size="sm" onClick={() => navigate({ to: currentStep.route })}>
                Take me there <ArrowRight className="size-3.5" />
              </Button>
            )}
            {isDoneStep ? (
              <Button size="sm" onClick={exitWorkflow}>Finish</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={nextStep}>Skip step</Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
