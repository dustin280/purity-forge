import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function PageHeader({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Receipt</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Chain of Custody</h1>
        <p className="text-sm text-muted-foreground mt-1">Documented record of every sample received by the lab.</p>
      </div>
      <Button onClick={onNew}>
        <Plus className="size-4 mr-1" /> New Chain of Custody
      </Button>
    </div>
  );
}
