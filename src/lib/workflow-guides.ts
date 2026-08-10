/**
 * Static step definitions for the guided workflow helper. Purely
 * presentational data — no logic here reads or writes app data. The
 * overlay looks up the current step's `targetSelector` in the DOM and
 * `completionEvent` matches against `signalEvent()` calls made from
 * existing mutation `onSuccess` handlers elsewhere in the app.
 */

export type WorkflowGuideId =
  | "full-walkthrough"
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

const DONE_STEP = (route: string, description: string): WorkflowGuideStep => ({
  title: "Done",
  description,
  route,
  targetSelector: null,
  completionEvent: null,
});

const RECEIVE_AND_SCHEDULE_STEPS: WorkflowGuideStep[] = [
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
];

const GENERATE_RUNLIST_STEPS: WorkflowGuideStep[] = [
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
];

const COMPLETE_RESULTS_STEPS: WorkflowGuideStep[] = [
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
];

const LOOKUP_STATUS_STEPS: WorkflowGuideStep[] = [
  {
    title: "Search for the sample",
    description: "Use the search box to find it by batch ID, client, project, or compound.",
    route: "/samples",
    targetSelector: '[data-guide="samples-search"]',
    completionEvent: null,
  },
];

export const WORKFLOW_GUIDES: Record<WorkflowGuideId, WorkflowGuide> = {
  "full-walkthrough": {
    id: "full-walkthrough",
    label: "Full Walkthrough",
    description: "Start to finish: receive a sample, schedule it, generate a run list, and complete + approve the result.",
    steps: [
      ...RECEIVE_AND_SCHEDULE_STEPS,
      ...GENERATE_RUNLIST_STEPS,
      ...COMPLETE_RESULTS_STEPS,
      DONE_STEP("/samples", "Full lifecycle complete — the sample was received, scheduled, run, and approved. Its vial position auto-released and the CoA is ready to download."),
    ],
  },
  "receive-and-schedule": {
    id: "receive-and-schedule",
    label: "Receive & Schedule Samples",
    description: "Log a new Chain of Custody intake and get the samples onto the queue.",
    steps: [
      ...RECEIVE_AND_SCHEDULE_STEPS,
      DONE_STEP("/queue", "Samples are received and scheduled — they're ready for the Run List Generator next."),
    ],
  },
  "generate-runlist": {
    id: "generate-runlist",
    label: "Generate Runlist",
    description: "Build and save a run list for an instrument.",
    steps: [
      ...GENERATE_RUNLIST_STEPS,
      DONE_STEP("/run-lists/generate", "The run list is saved and vial positions are reserved — ready to sync to the instrument."),
    ],
  },
  "complete-results": {
    id: "complete-results",
    label: "Complete Results",
    description: "Find an in-progress sample, record its result, and approve it.",
    steps: [
      ...COMPLETE_RESULTS_STEPS,
      DONE_STEP("/samples", "Result approved — the vial position is auto-released and the CoA is ready to download."),
    ],
  },
  "lookup-status": {
    id: "lookup-status",
    label: "Lookup Sample Status",
    description: "Find a sample and check where it stands.",
    steps: [
      ...LOOKUP_STATUS_STEPS,
      DONE_STEP("/samples", "Click the row to open it — the status pill shows where it stands, and the CoA tab has the download once approved."),
    ],
  },
};

export const WORKFLOW_GUIDE_LIST = Object.values(WORKFLOW_GUIDES);
