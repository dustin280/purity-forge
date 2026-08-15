import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { getPrepSettings, updatePrepSettings, type PrepSettings } from "@/lib/sample-prep/master-data.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/sample-prep/settings")({
  head: () => ({ meta: [
    { title: "Sample Prep Settings" },
    { name: "description", content: "Global thresholds for sample-prep calculations: pipette limits, calibration defaults, and dilution step caps." },
    { property: "og:title", content: "Sample Prep Settings" },
    { property: "og:description", content: "Admin-managed global settings for sample preparation." },
  ]}),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { data } = useQuery({ queryKey: ["sp-settings"], queryFn: () => getPrepSettings() });
  const [form, setForm] = useState<PrepSettings | null>(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await updatePrepSettings({ data: form });
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["sp-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title="Sample Prep Settings" description="Global thresholds used across the module. Only admins can save changes.">
      <Card className="p-4 max-w-xl space-y-3">
        <F label="Absolute minimum pipette (µL)"><Input type="number" step="any" value={form?.absolute_min_pipette_ul ?? ""} onChange={e => setForm(f => f ? { ...f, absolute_min_pipette_ul: Number(e.target.value) } : f)} /></F>
        <F label="Preferred minimum pipette (µL)"><Input type="number" step="any" value={form?.preferred_min_pipette_ul ?? ""} onChange={e => setForm(f => f ? { ...f, preferred_min_pipette_ul: Number(e.target.value) } : f)} /></F>
        <F label="Default calibration levels"><Input type="number" value={form?.default_calibration_levels ?? ""} onChange={e => setForm(f => f ? { ...f, default_calibration_levels: Number(e.target.value) } : f)} /></F>
        <F label="Default target level"><Input type="number" value={form?.default_target_level ?? ""} onChange={e => setForm(f => f ? { ...f, default_target_level: Number(e.target.value) } : f)} /></F>
        <F label="Max dilution steps"><Input type="number" value={form?.max_dilution_steps ?? ""} onChange={e => setForm(f => f ? { ...f, max_dilution_steps: Number(e.target.value) } : f)} /></F>
        <F label="LM-SamplePrep Drive folder">
          <Input
            value={form?.drive_lm_sample_prep_folder_id ?? ""}
            placeholder="Folder ID or Drive URL"
            onChange={e => setForm(f => f ? { ...f, drive_lm_sample_prep_folder_id: e.target.value } : f)}
          />
        </F>
        <F label="LM-Reports Complete Drive folder">
          <Input
            value={form?.drive_lm_reports_complete_folder_id ?? ""}
            placeholder="Folder ID or Drive URL"
            onChange={e => setForm(f => f ? { ...f, drive_lm_reports_complete_folder_id: e.target.value } : f)}
          />
        </F>
        <F label="HPLC Results Drive folder">
          <Input
            value={form?.drive_hplc_results_folder_id ?? ""}
            placeholder="Folder ID or Drive URL"
            onChange={e => setForm(f => f ? { ...f, drive_hplc_results_folder_id: e.target.value } : f)}
          />
        </F>
        <F label="Cal Std Drive folder">
          <Input
            value={form?.drive_cal_std_folder_id ?? ""}
            placeholder="Folder ID or Drive URL"
            onChange={e => setForm(f => f ? { ...f, drive_cal_std_folder_id: e.target.value } : f)}
          />
        </F>
        <F label="QC Samples Drive folder">
          <Input
            value={form?.drive_qc_samples_folder_id ?? ""}
            placeholder="Folder ID or Drive URL"
            onChange={e => setForm(f => f ? { ...f, drive_qc_samples_folder_id: e.target.value } : f)}
          />
        </F>
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{isAdmin ? "" : "Read-only — admin required to save."}</span>
          <Button disabled={!isAdmin || save.isPending || !form} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save settings"}</Button>
        </div>
      </Card>
    </SamplePrepShell>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-2 items-center gap-2"><Label className="text-xs">{label}</Label>{children}</div>;
}