import { Card } from "@/components/ui/card";
import { InfoRow } from "@/components/samples/info-row";

type Sample = {
  client: string;
  project: string | null;
  receipt_date: string;
  created_at: string;
  notes: string | null;
  compound?: string | null;
  lot?: string | null;
};

type Test = {
  method_name: string | null;
  instrument: string | null;
  status: string | null;
} | undefined;

export function SampleInfoTab({ sample, test }: { sample: Sample; test: Test }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-5 border-border">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Sample</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow k="Client" v={sample.client} />
          <InfoRow k="Project" v={sample.project ?? "—"} />
          <InfoRow k="Compound" v={sample.compound ?? "—"} />
          <InfoRow k="Lot" v={sample.lot ?? "—"} />
          <InfoRow k="Receipt" v={sample.receipt_date} />
          <InfoRow k="Created" v={new Date(sample.created_at).toLocaleString()} />
          <InfoRow k="Notes" v={sample.notes ?? "—"} />
        </dl>
      </Card>
      <Card className="p-5 border-border">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Test Method</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow k="Method" v={test?.method_name ?? "—"} />
          <InfoRow k="Instrument" v={test?.instrument ?? "—"} />
          <InfoRow k="Status" v={test?.status ?? "—"} />
        </dl>
      </Card>
    </div>
  );
}