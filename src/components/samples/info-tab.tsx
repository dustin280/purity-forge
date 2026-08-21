import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoRow } from "@/components/samples/info-row";
import { updateTestSpec } from "@/lib/lims.functions";
import { syncVialPhotoToReportsDrive } from "@/lib/lims/coc/vial-photo-drive-sync.functions";
import { qk } from "@/lib/query-keys";

type Sample = {
  id: string;
  client: string;
  project: string | null;
  receipt_date: string;
  created_at: string;
  notes: string | null;
  compound?: string | null;
  lot?: string | null;
  catalog?: string | null;
  container_size?: string | null;
  physical_description?: string | null;
  priority?: number | null;
  due_date?: string | null;
  received_form?: string | null;
  received_quantity?: number | null;
  received_quantity_unit?: string | null;
  received_purity_percent?: number | null;
};

type Test =
  | {
      id: string;
      method_name: string | null;
      instrument: string | null;
      status: string | null;
      spec_min: number | null;
      spec_max: number | null;
    }
  | undefined;

export function SampleInfoTab({
  sample,
  test,
  batchId,
}: {
  sample: Sample;
  test: Test;
  batchId: string;
}) {
  const qc = useQueryClient();
  const updateSpecFn = useServerFn(updateTestSpec);
  const syncVialPhotoFn = useServerFn(syncVialPhotoToReportsDrive);
  const [specMin, setSpecMin] = useState(test?.spec_min?.toString() ?? "");
  const [specMax, setSpecMax] = useState(test?.spec_max?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);

  async function syncVialPhoto() {
    setSyncingPhoto(true);
    try {
      const res = await syncVialPhotoFn({ data: { sample_id: sample.id } });
      if (res.ok) toast.success(`Vial photo synced to Drive as "${res.drive_file_name}"`);
      else toast.error(res.reason ?? "Vial photo sync failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vial photo sync failed");
    } finally {
      setSyncingPhoto(false);
    }
  }

  async function saveSpec() {
    if (!test) return;
    setSaving(true);
    try {
      await updateSpecFn({
        data: {
          testId: test.id,
          spec_min: specMin.trim() === "" ? null : Number(specMin),
          spec_max: specMax.trim() === "" ? null : Number(specMax),
        },
      });
      toast.success("Acceptance criteria saved");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save spec");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-5 border-border">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Sample</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow k="Client" v={sample.client} />
          <InfoRow k="Project" v={sample.project ?? "—"} />
          <InfoRow k="Compound" v={sample.compound ?? "—"} />
          <InfoRow k="Lot" v={sample.lot ?? "—"} />
          <InfoRow k="Catalog #" v={sample.catalog ?? "—"} />
          <InfoRow k="Received Form" v={sample.received_form ?? "—"} />
          <InfoRow
            k="Received Qty"
            v={
              sample.received_quantity != null
                ? `${sample.received_quantity} ${sample.received_quantity_unit ?? ""}`.trim()
                : "—"
            }
          />
          <InfoRow
            k="Received Purity"
            v={sample.received_purity_percent != null ? `${sample.received_purity_percent}%` : "—"}
          />
          <InfoRow k="Container Size" v={sample.container_size ?? "—"} />
          <InfoRow k="Physical Description" v={sample.physical_description ?? "—"} />
          <InfoRow k="Priority" v={sample.priority != null ? String(sample.priority) : "—"} />
          <InfoRow k="Due Date" v={sample.due_date ?? "—"} />
          <InfoRow k="Receipt" v={sample.receipt_date} />
          <InfoRow k="Created" v={new Date(sample.created_at).toLocaleString()} />
          <InfoRow k="Notes" v={sample.notes ?? "—"} />
        </dl>
        <div className="pt-3 mt-3 border-t border-border">
          <Button size="sm" variant="outline" disabled={syncingPhoto} onClick={syncVialPhoto}>
            {syncingPhoto ? "Syncing…" : "Sync Vial Photo to Drive"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Pushes this sample's intake vial photo to the Drive "LM-Reports Complete" folder, named
            "{batchId}.jpg".
          </p>
        </div>
      </Card>
      <Card className="p-5 border-border space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Test Method
          </h3>
          <dl className="space-y-2 text-sm">
            <InfoRow k="Method" v={test?.method_name ?? "—"} />
            <InfoRow k="Instrument" v={test?.instrument ?? "—"} />
            <InfoRow k="Status" v={test?.status ?? "—"} />
          </dl>
        </div>
        {test && (
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Purity Acceptance Criteria
            </h4>
            <div className="flex items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Min %
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  max={100}
                  value={specMin}
                  onChange={(e) => setSpecMin(e.target.value)}
                  className="w-24 mt-1"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Max %
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  max={100}
                  value={specMax}
                  onChange={(e) => setSpecMax(e.target.value)}
                  className="w-24 mt-1"
                />
              </label>
              <Button size="sm" variant="outline" disabled={saving} onClick={saveSpec}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Leave blank if no acceptance range has been established for this method yet.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
