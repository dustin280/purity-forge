import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { WORKFLOW_GUIDES, type WorkflowGuideId, type WorkflowGuideStep } from "@/lib/workflow-guides";

const STORAGE_KEY = "workflow-guide-state";

interface StoredState {
  activeWorkflow: WorkflowGuideId | null;
  stepIndex: number;
}

function readStored(): StoredState {
  if (typeof window === "undefined") return { activeWorkflow: null, stepIndex: 0 };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeWorkflow: null, stepIndex: 0 };
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed.activeWorkflow && !(parsed.activeWorkflow in WORKFLOW_GUIDES)) {
      return { activeWorkflow: null, stepIndex: 0 };
    }
    return parsed;
  } catch {
    return { activeWorkflow: null, stepIndex: 0 };
  }
}

function writeStored(state: StoredState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface WorkflowGuideContextValue {
  activeWorkflow: WorkflowGuideId | null;
  stepIndex: number;
  currentStep: WorkflowGuideStep | null;
  totalSteps: number;
  startWorkflow: (id: WorkflowGuideId) => void;
  exitWorkflow: () => void;
  nextStep: () => void;
  signalEvent: (event: string) => void;
}

const WorkflowGuideContext = createContext<WorkflowGuideContextValue | null>(null);

export function WorkflowGuideProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(readStored);

  const startWorkflow = useCallback((id: WorkflowGuideId) => {
    const next = { activeWorkflow: id, stepIndex: 0 };
    setState(next);
    writeStored(next);
  }, []);

  const exitWorkflow = useCallback(() => {
    const next = { activeWorkflow: null, stepIndex: 0 };
    setState(next);
    writeStored(next);
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => {
      if (!prev.activeWorkflow) return prev;
      const guide = WORKFLOW_GUIDES[prev.activeWorkflow];
      const nextIndex = Math.min(prev.stepIndex + 1, guide.steps.length - 1);
      const next = { ...prev, stepIndex: nextIndex };
      writeStored(next);
      return next;
    });
  }, []);

  const signalEvent = useCallback((event: string) => {
    setState((prev) => {
      if (!prev.activeWorkflow) return prev;
      const guide = WORKFLOW_GUIDES[prev.activeWorkflow];
      const current = guide.steps[prev.stepIndex];
      if (!current || current.completionEvent !== event) return prev;
      const nextIndex = Math.min(prev.stepIndex + 1, guide.steps.length - 1);
      const next = { ...prev, stepIndex: nextIndex };
      writeStored(next);
      return next;
    });
  }, []);

  const currentStep = state.activeWorkflow
    ? WORKFLOW_GUIDES[state.activeWorkflow].steps[state.stepIndex] ?? null
    : null;
  const totalSteps = state.activeWorkflow ? WORKFLOW_GUIDES[state.activeWorkflow].steps.length : 0;

  const value = useMemo<WorkflowGuideContextValue>(() => ({
    activeWorkflow: state.activeWorkflow,
    stepIndex: state.stepIndex,
    currentStep,
    totalSteps,
    startWorkflow,
    exitWorkflow,
    nextStep,
    signalEvent,
  }), [state.activeWorkflow, state.stepIndex, currentStep, totalSteps, startWorkflow, exitWorkflow, nextStep, signalEvent]);

  return <WorkflowGuideContext.Provider value={value}>{children}</WorkflowGuideContext.Provider>;
}

export function useWorkflowGuide(): WorkflowGuideContextValue {
  const ctx = useContext(WorkflowGuideContext);
  if (!ctx) throw new Error("useWorkflowGuide must be used within WorkflowGuideProvider");
  return ctx;
}

/**
 * Safe to call from anywhere, including components rendered outside the
 * provider (shouldn't happen under `_authenticated`, but mutation hooks
 * are sometimes reused in tests/storybooks) — no-ops instead of throwing.
 */
export function useWorkflowSignal(): (event: string) => void {
  const ctx = useContext(WorkflowGuideContext);
  return ctx?.signalEvent ?? (() => {});
}
