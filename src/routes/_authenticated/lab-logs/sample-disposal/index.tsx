import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import {
  listSampleLocations, getDisposalConfig, updateDisposalConfig, disposeSampleLocation,
  type SampleLocationRow,
} from "@/lib/sample-disposal.functions";

export const Route = createFileRoute("/_authenticated/lab-logs/sample-disposal/")({
  component: SampleDisposalLog,
});

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  removed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  disposed: "bg-muted text-muted-foreground",
};

function disposalEligibleAt(completionDate: string | null, retentionDays: number): Date | null {
  if (!completionDate) return null;
  const d = new Date(completionDate);
  d.setUTCDate(d.getUTCDate() + retentionDays);
  return d;
}

function SampleDisposalLog() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const listFn = useServerFn(listSampleLocations);
  const getCfg = useServerFn(getDisposalConfig);
  const updCfg = useServerFn(updateDisposalConfig);
  const disposeFn = useServerFn(disposeSampleLocation);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.sampleDisposal.list(),
    queryFn: () => listFn(),
  });
  const { data: cfg } = useQuery({
    queryKey: qk.sampleDisposal.config(),
    queryFn: () => getCfg(),
  });
  const retentionDays = cfg?.retention_days ?? 30;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [retentionDraft, setRetentionDraft] = useState<string>("");

  const updCfgMut = useMutation({
    mutationFn: (retention_days: number) => updCfg({ data: { retention_days } }),
    onSuccess: () => {
      toast.success("Retention window updated");
      qc.invalidateQueries({ queryKey: qk.sampleDisposal.config() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disposeMut = useMutation({
    mutationFn: (id: string) => disposeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Marked disposed");
      qc.invalidateQueries({ queryKey: qk.sampleDisposal.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <Link to="/lab-logs" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Logs
      </Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Sample Disposal Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every tracked sample location — received, instrument, and (in the future) dilution
          positions — with disposal gated behind the retention window below.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Label className="text-xs">Retention window</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              disabled={!isAdmin}
              defaultValue={retentionDays}
              key={retentionDays}
              placeholder={String(retentionDays)}
              onChange={(e) => setRetentionDraft(e.target.value)}
              onBlur={() => {
                const n = Number(retentionDraft);
                if (retentionDraft !== "" && Number.isFinite(n) && n !== retentionDays) {
                  updCfgMut.mutate(n);
                }
                setRetentionDraft("");
              }}
              className="h-8"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">days after completion</span>
          </div>
        </div>
        <div className="w-44">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
              <SelectItem value="disposed">Disposed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Sample</th>
              <th className="text-left px-3 py-2">Client / Compound</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Location</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Assigned</th>
              <th className="text-left px-3 py-2">Removed</th>
              <th className="text-left px-3 py-2">Eligible</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No records match.</td></tr>
            ) : filtered.map((r) => (
              <DisposalRow
                key={r.id}
                row={r}
                retentionDays={retentionDays}
                disposing={disposeMut.isPending}
                onDispose={() => disposeMut.mutate(r.id)}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DisposalRow({ row, retentionDays, disposing, onDispose }: {
  row: SampleLocationRow; retentionDays: number; disposing: boolean; onDispose: () => void;
}) {
  const eligibleAt = disposalEligibleAt(row.sample?.actual_completion_date ?? null, retentionDays);
  const now = new Date();
  const isEligible = row.status === "removed" && eligibleAt !== null && eligibleAt.getTime() <= now.getTime();
  const canDispose = row.status === "removed";

  let disabledReason = "";
  if (row.status === "active") disabledReason = "Still active — not yet removed from its location";
  else if (row.status === "disposed") disabledReason = "Already disposed";
  else if (!eligibleAt) disabledReason = "Sample has no recorded completion date yet";
  else if (!isEligible) disabledReason = `Eligible ${eligibleAt.toISOString().slice(0, 10)}`;

  return (
    <tr>
      <td className="px-3 py-2 font-mono">{row.sample?.batch_id ?? row.sample_id}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.sample?.client}{row.sample?.compound ? ` · ${row.sample.compound}` : ""}
      </td>
      <td className="px-3 py-2">{row.location_type}</td>
      <td className="px-3 py-2 font-mono">{row.location}</td>
      <td className="px-3 py-2">
        <Badge className={STATUS_BADGE[row.status] ?? ""} variant="secondary">{row.status}</Badge>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{new Date(row.assigned_at).toLocaleDateString()}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.removed_at ? new Date(row.removed_at).toLocaleDateString() : "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{eligibleAt ? eligibleAt.toISOString().slice(0, 10) : "—"}</td>
      <td className="px-3 py-2">
        {canDispose && (
          <Button
            size="sm"
            variant={isEligible ? "destructive" : "outline"}
            disabled={!isEligible || disposing}
            title={disabledReason}
            onClick={onDispose}
          >
            Dispose
          </Button>
        )}
      </td>
    </tr>
  );
}
