/**
 * Volume-remaining + lifecycle tracking for a standard prep (Track A3).
 * Only rendered when the row has a real final_volume_ml — legacy Batch
 * calculator entries have nothing to track against and this card is simply
 * omitted for those.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Droplet, Trash2 } from "lucide-react";

type UsageEntry = {
  id: string; withdrawn_ml: number; purpose: string | null; notes: string | null;
  actor_name: string; created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  in_use: { label: "In use", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  depleted: { label: "Depleted", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  discarded: { label: "Discarded", className: "bg-muted text-muted-foreground border-border" },
};

export function PrepLifecycleCard({
  finalVolumeMl, volumeRemainingMl, lifecycleStatus, usageLog, canEdit, canReview, actorName,
  onRecordUsage, onDiscard, recordUsagePending, discardPending,
}: {
  finalVolumeMl: number;
  volumeRemainingMl: number | null;
  lifecycleStatus: string;
  usageLog: UsageEntry[];
  canEdit: boolean;
  canReview: boolean;
  actorName: string;
  onRecordUsage: (args: { withdrawn_ml: number; actor_name: string; purpose?: string | null; notes?: string | null }) => void;
  onDiscard: (args: { actor_name: string; reason?: string | null }) => void;
  recordUsagePending: boolean;
  discardPending: boolean;
}) {
  const [usageOpen, setUsageOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  const remaining = volumeRemainingMl ?? finalVolumeMl;
  const status = STATUS_LABEL[lifecycleStatus] ?? { label: lifecycleStatus, className: "" };
  const disabled = lifecycleStatus !== "in_use";

  function submitUsage() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    onRecordUsage({ withdrawn_ml: n, actor_name: actorName, purpose: purpose.trim() || null, notes: notes.trim() || null });
    setUsageOpen(false);
    setAmount(""); setPurpose(""); setNotes("");
  }

  function submitDiscard() {
    onDiscard({ actor_name: actorName, reason: reason.trim() || null });
    setDiscardOpen(false);
    setReason("");
  }

  return (
    <Card className="p-5 space-y-3 text-sm mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume & Lifecycle</h2>
        <Badge variant="outline" className={status.className}>{status.label}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <Droplet className="size-4 text-muted-foreground" />
        <span className="font-medium">{remaining}</span>
        <span className="text-muted-foreground">of {finalVolumeMl} mL remaining</span>
      </div>

      <div className="flex items-center gap-2">
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setUsageOpen(true)} disabled={disabled}>
            Record Usage
          </Button>
        )}
        {canReview && lifecycleStatus !== "discarded" && (
          <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="size-3.5 mr-1" /> Discard
          </Button>
        )}
      </div>

      {usageLog.length > 0 && (
        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground mb-1">Usage history</div>
          <ul className="space-y-1">
            {usageLog.map((u) => (
              <li key={u.id} className="text-xs flex items-baseline justify-between gap-2 border-b border-dashed py-1 last:border-0">
                <span>
                  <span className="font-medium">{u.withdrawn_ml} mL</span> by {u.actor_name}
                  {u.purpose ? ` · ${u.purpose}` : ""}
                  {u.notes ? ` — ${u.notes}` : ""}
                </span>
                <span className="text-muted-foreground shrink-0">{new Date(u.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Usage</DialogTitle>
            <DialogDescription className="sr-only">Log a volume withdrawal from this preparation</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount withdrawn (mL) <span className="text-destructive">*</span></Label>
              <Input type="number" step="any" min="0.001" className="mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">Purpose (optional)</Label>
              <Input className="mt-1" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Sample prep for batch X" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUsageOpen(false)}>Cancel</Button>
            <Button disabled={!Number(amount) || recordUsagePending} onClick={submitUsage}>
              {recordUsagePending ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard Preparation</DialogTitle>
            <DialogDescription className="sr-only">Mark this preparation as discarded, removing it from future pickers</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes it from the Working Standard source picker, regardless of remaining volume. This can't be undone from here.
          </p>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea rows={2} className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contaminated, container broke" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={discardPending} onClick={submitDiscard}>
              {discardPending ? "Discarding…" : "Discard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
