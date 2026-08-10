import { Button } from "@/components/ui/button";
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
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={onAutoSchedule} disabled={isPending} data-guide="queue-auto-schedule">
          <Wand2 className="size-4 mr-2" /> Auto-Schedule Pending Samples
        </Button>
        <Button className="w-full justify-start" onClick={onCheckCapacity}>
          <Search className="size-4 mr-2" /> Check New Sample Capacity
        </Button>
      </div>
    </div>
  );
}