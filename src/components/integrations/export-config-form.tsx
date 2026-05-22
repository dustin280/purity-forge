import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type ExportConfigForm = {
  id: string | undefined;
  webhook_url: string;
  include_lcs: boolean;
  include_ccv: boolean;
  include_method_blank: boolean;
  include_calibration: boolean;
  is_active: boolean;
};

const TOGGLES = [
  ["include_lcs", "LCS Recovery"],
  ["include_ccv", "CCV Recovery"],
  ["include_method_blank", "Method Blank Spectra"],
  ["include_calibration", "Calibration Data"],
] as const;

/**
 * Webhook URL + extras toggles + active switch for the COA export config.
 * Pure controlled form; parent owns the state and the Save button.
 */
export function ExportConfigForm({
  form,
  onChange,
}: {
  form: ExportConfigForm;
  onChange: (next: ExportConfigForm) => void;
}) {
  return (
    <>
      <Card className="p-5 border-border space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Push Webhook (optional)</h2>
        <div className="space-y-1.5">
          <Label htmlFor="hook">Webhook URL</Label>
          <Input
            id="hook"
            type="url"
            placeholder="https://your-coa-system.example.com/hook"
            value={form.webhook_url}
            onChange={e => onChange({ ...form, webhook_url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Approved samples will be POSTed here as JSON.</p>
        </div>
      </Card>

      <Card className="p-5 border-border space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Data Stream Extras</h2>
        <p className="text-xs text-muted-foreground">Include additional QC data with each export.</p>
        {TOGGLES.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between py-1">
            <Label htmlFor={k}>{label}</Label>
            <Switch
              id={k}
              checked={form[k]}
              onCheckedChange={v => onChange({ ...form, [k]: v })}
            />
          </div>
        ))}
        <div className="flex items-center justify-between py-1 border-t border-border pt-3">
          <Label htmlFor="active">Active</Label>
          <Switch
            id="active"
            checked={form.is_active}
            onCheckedChange={v => onChange({ ...form, is_active: v })}
          />
        </div>
      </Card>
    </>
  );
}