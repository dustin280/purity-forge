import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { AccessLogsSummary } from "./types";

export function AccessLogsFiltersCard({
  from, to, onFromChange, onToChange, summary, onDownload, downloadDisabled,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  summary: AccessLogsSummary;
  onDownload: () => void;
  downloadDisabled: boolean;
}) {
  return (
    <Card className="p-4 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-xs">From</Label>
          <Input id="from" type="date" value={from} onChange={e => onFromChange(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-xs">To</Label>
          <Input id="to" type="date" value={to} onChange={e => onToChange(e.target.value)} className="w-40" />
        </div>
        <div className="flex-1 min-w-0" />
        <div className="text-xs text-muted-foreground mr-2">
          {summary.total} events &middot; {summary.logins} logins &middot; {summary.logouts} logouts
        </div>
        <Button onClick={onDownload} disabled={downloadDisabled}>
          <Download className="size-4" /> Download PDF
        </Button>
      </div>
    </Card>
  );
}