/**
 * Static step definitions for the guided workflow helper. Purely
 * presentational data — no logic here reads or writes app data. The
 * overlay looks up the current step's `targetSelector` in the DOM and
 * `completionEvent` matches against `signalEvent()` calls made from
 * existing mutation `onSuccess` handlers elsewhere in the app.
 */

export type WorkflowGuideId =
  | "receive-and-schedule"
  | "generate-runlist"
  | "complete-results"
  | "lookup-status";

export interface WorkflowGuideStep {
  title: string;
  description: string;
  route: string;
  targetSelector: string | null;
  completionEvent: string | null;
}

export interface WorkflowGuide {
  id: WorkflowGuideId;
  label: string;
  description: string;
  steps: WorkflowGuideStep[];
}

export const WORKFLOW_GUIDES: Record<WorkflowGuideId, WorkflowGuide> = {
  "receive-and-schedule": {
    id: "receive-and-schedule",
    label: "Receive & Schedule Samples",
    description: "Log a new Chain of Custody intake and get the samples onto the queue.",
    steps: [
      {
        title: "Start a new sample receipt",
        description: "On Sample Receipt, click “New Sample Receipt” and fill out the intake form.",
        route: "/chain-of-custody",
        targetSelector: '[data-guide="coc-new"]',
        completionEvent: "coc-submitted",
      },
      {
        title: "Schedule the new samples",
        description: "On the Analysis Queue, click “Auto-Schedule Pending Samples” and apply.",
        route: "/queue",
        targetSelector: '[data-guide="queue-auto-schedule"]',
        completionEvent: "auto-scheduled",
      },
      {
        title: "Done",
        description: "Samples are received and scheduled — they're ready for the Run List Generator next.",
        route: "/queue",
        targetSelector: null,
        completionEvent: null,
      },
    ],
  },
  "generate-runlist": {
    id: "generate-runlist",
    label: "Generate Runlist",
    description: "Build and save a run list for an instrument.",
    steps: [
      {
        title: "Analyze & propose",
        description: "Pick an instrument and date, then click “Analyze & Propose.”",
        route: "/run-lists/generate",
        targetSelector: '[data-guide="generate-analyze"]',
        completionEvent: null,
      },
      {
        title: "Save the run list",
        description: "Review the proposed sequences, then click “Generate CSV” to save it.",
        route: "/run-lists/generate",
        targetSelector: '[data-guide="generate-save"]',
        completionEvent: "run-list-saved",
      },
      {
        title: "Done",
        description: "The run list is saved and vial positions are reserved — ready to sync to the instrument.",
        route: "/run-lists/generate",
        targetSelector: null,
        completionEvent: null,
      },
    ],
  },
  "complete-results": {
    id: "complete-results",
    label: "Complete Results",
    description: "Find an in-progress sample, record its result, and approve it.",
    steps: [
      {
        title: "Find the sample",
        description: "Search for the sample that's ready for results.",
        route: "/samples",
        targetSelector: '[data-guide="samples-search"]',
        completionEvent: null,
      },
      {
        title: "Save the result",
        description: "On the sample's Results tab, paste in the result and click “Save Result.”",
        route: "/samples",
        targetSelector: '[data-guide="results-submit"]',
        completionEvent: null,
      },
      {
        title: "Approve the result",
        description: "Once reviewed, click “Approve.”",
        route: "/samples",
        targetSelector: '[data-guide="results-approve"]',
        completionEvent: "sample-approved",
      },
      {
        title: "Done",
        description: "Result approved — the vial position is auto-released and the CoA is ready to download.",
        route: "/samples",
        targetSelector: null,
        completionEvent: null,
      },
    ],
  },
  "lookup-status": {
    id: "lookup-status",
    label: "Lookup Sample Status",
    description: "Find a sample and check where it stands.",
    steps: [
      {
        title: "Search for the sample",
        description: "Use the search box to find it by batch ID, client, project, or compound.",
        route: "/samples",
        targetSelector: '[data-guide="samples-search"]',
        completionEvent: null,
      },
      {
        title: "Done",
        description: "Click the row to open it — the status pill shows where it stands, and the CoA tab has the download once approved.",
        route: "/samples",
        targetSelector: null,
        completionEvent: null,
      },
    ],
  },
};

export const WORKFLOW_GUIDE_LIST = Object.values(WORKFLOW_GUIDES);
