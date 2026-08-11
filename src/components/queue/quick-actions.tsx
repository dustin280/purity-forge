import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wand2, Search } from "lucide-react";

export function QuickActions({
  onAutoSchedule,
  onCheckCapacity,
  isPending,
}: {
  onAutoSchedule: () => void;
  onCheckCapacity: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-semibold mb-3">Quick Actions</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="sm:flex-1 justify-start"
              onClick={onAutoSchedule}
              disabled={isPending}
              data-guide="queue-auto-schedule"
            >
              <Wand2 className="size-4 mr-2" /> Auto-Schedule Pending Samples
            </Button>
          </TooltipTrigger>
          <TooltipContent>Assign received-but-unscheduled samples to the earliest day with open capacity.</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="sm:flex-1 justify-start" onClick={onCheckCapacity}>
              <Search className="size-4 mr-2" /> Check New Sample Capacity
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview how many new samples the queue can absorb before due dates slip.</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}