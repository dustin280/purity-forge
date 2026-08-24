import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, ListChecks, CheckCircle2, Search, ChevronRight, Route, Beaker } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useWorkflowGuide } from "@/contexts/workflow-guide-context";
import { WORKFLOW_GUIDES, type WorkflowGuideId } from "@/lib/workflow-guides";

const ICONS: Record<WorkflowGuideId, typeof ClipboardList> = {
  "full-walkthrough": Route,
  "receive-and-schedule": ClipboardList,
  "generate-runlist": ListChecks,
  "complete-results": CheckCircle2,
  "lookup-status": Search,
  "sample-standard-prep": Beaker,
};

const GRANULAR_IDS: WorkflowGuideId[] = [
  "receive-and-schedule",
  "generate-runlist",
  "sample-standard-prep",
  "complete-results",
  "lookup-status",
];

export function WorkflowLauncher() {
  const { startWorkflow } = useWorkflowGuide();
  const navigate = useNavigate();

  const start = (id: WorkflowGuideId) => {
    startWorkflow(id);
    navigate({ to: WORKFLOW_GUIDES[id].steps[0].route });
  };

  const full = WORKFLOW_GUIDES["full-walkthrough"];
  const FullIcon = ICONS["full-walkthrough"];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Guided Workflows</div>

      <Card
        className="p-4 border-primary/40 bg-primary/5 hover:border-primary transition-colors cursor-pointer group mb-3"
        onClick={() => start("full-walkthrough")}
      >
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md bg-primary/15 grid place-items-center shrink-0">
            <FullIcon className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{full.label}</div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
            <div className="text-xs text-muted-foreground mt-1">{full.description}</div>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {GRANULAR_IDS.map((id) => {
          const guide = WORKFLOW_GUIDES[id];
          const Icon = ICONS[id];
          return (
            <Card
              key={id}
              className="p-4 border-border hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => start(id)}
            >
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-md bg-muted grid place-items-center shrink-0">
                  <Icon className="size-4 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{guide.label}</div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{guide.description}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
