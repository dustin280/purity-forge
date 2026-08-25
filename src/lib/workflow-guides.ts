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
  | "lookup-status"
  | "sample-standard-prep";

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
    title: "Pick instrument",
    description: "Choose which instrument to build a run list for.",
    route: "/run-lists/generate",
    targetSelector: '[data-guide="generate-instrument"]',
    completionEvent: "instrument-picked",
  },
  {
    title: "Select Samples",
    description: "Click “Select Samples” to preview optimized sequences.",
    route: "/run-lists/generate",
    targetSelector: '[data-guide="generate-analyze"]',
    completionEvent: "samples-selected",
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
    description: "Search for the sample that's ready for results, then open it.",
    route: "/samples",
    targetSelector: '[data-guide="samples-search"]',
    completionEvent: "sample-opened",
  },
  {
    title: "Save the result",
    description: "On the sample's Results tab, paste in the result and click “Save Result.”",
    route: "/samples",
    targetSelector: '[data-guide="results-submit"]',
    completionEvent: "result-submitted",
  },
  {
    title: "Review & Complete",
    description: "Click “Review & Complete” — one click reviews, approves, and finishes the sample.",
    route: "/samples",
    targetSelector: '[data-guide="results-review"]',
    completionEvent: "sample-approved",
  },
];

const SAMPLE_STANDARD_PREP_STEPS: WorkflowGuideStep[] = [
  {
    title: "Start a Standard Set",
    description: "On Standard Preparations, click “New Preparation” then choose “Standard Set (multi-level).”",
    route: "/lab-logs/standard-preparations/new",
    targetSelector: '[data-guide="prep-new-set"]',
    completionEvent: "standard-set-picked",
  },
  {
    title: "Build the grid and save",
    description: "Add each compound, fill in the concentration grid, then click “Save & Download Cut Sheet” — it downloads a printable label + recipe sheet and saves the permanent record.",
    route: "/lab-logs/standard-preparations/new",
    targetSelector: '[data-guide="standard-set-submit"]',
    completionEvent: "standard-set-created",
  },
  {
    title: "Generate Sample Prep for a run list",
    description: "Open a run list and click “Generate Sample Prep” to compute a dilution plan for every sample on it.",
    route: "/run-lists",
    targetSelector: '[data-guide="runlist-generate-prep"]',
    completionEvent: "runlist-prep-opened",
  },
  {
    title: "Review and accept",
    description: "Fill in any gaps flagged, then click “Accept all ready” to save the prep records and push them to Drive.",
    route: "/run-lists",
    targetSelector: '[data-guide="prep-accept-all"]',
    completionEvent: "sample-prep-accepted",
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
  "sample-standard-prep": {
    id: "sample-standard-prep",
    label: "Sample & Standard Prep",
    description: "Prepare a calibration standard, then generate and accept the dilution plan for a run list's samples.",
    steps: [
      ...SAMPLE_STANDARD_PREP_STEPS,
      DONE_STEP("/run-lists", "Standard and sample preps are ready. Open the run list's Bench Sheet to execute at the bench — the cut sheet and prep records are your permanent documentation."),
    ],
  },
};

export const WORKFLOW_GUIDE_LIST = Object.values(WORKFLOW_GUIDES);
