import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, ListChecks, CheckCircle2, Search, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useWorkflowGuide } from "@/contexts/workflow-guide-context";
import { WORKFLOW_GUIDE_LIST, type WorkflowGuideId } from "@/lib/workflow-guides";

const ICONS: Record<WorkflowGuideId, typeof ClipboardList> = {
  "receive-and-schedule": ClipboardList,
  "generate-runlist": ListChecks,
  "complete-results": CheckCircle2,
  "lookup-status": Search,
};

export function WorkflowLauncher() {
  const { startWorkflow } = useWorkflowGuide();
  const navigate = useNavigate();

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Guided Workflows</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {WORKFLOW_GUIDE_LIST.map((guide) => {
          const Icon = ICONS[guide.id];
          return (
            <Card
              key={guide.id}
              className="p-4 border-border hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => {
                startWorkflow(guide.id);
                navigate({ to: guide.steps[0].route });
              }}
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
