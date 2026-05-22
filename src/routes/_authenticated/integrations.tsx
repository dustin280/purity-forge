import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getExportConfig, saveExportConfig, getSftpConfig, saveSftpConfig } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { ApiKeyCard } from "@/components/integrations/api-key-card";
import { ExportConfigForm, type ExportConfigForm as ExportConfigFormState } from "@/components/integrations/export-config-form";
import { SftpCard, type SftpForm } from "@/components/integrations/sftp-card";
export const Route = createFileRoute("/_authenticated/integrations")({ component: Integrations });

function Integrations() {
  const qc = useQueryClient();
  const getFn = useServerFn(getExportConfig);
  const saveFn = useServerFn(saveExportConfig);
  const { data } = useQuery({ queryKey: qk.integrations.exportConfig(), queryFn: () => getFn() });

  const getSftp = useServerFn(getSftpConfig);
  const saveSftp = useServerFn(saveSftpConfig);
  const { data: sftpData } = useQuery({ queryKey: qk.integrations.sftpConfig(), queryFn: () => getSftp() });

  const [form, setForm] = useState<ExportConfigFormState>({
    id: undefined,
    webhook_url: "",
    include_lcs: true,
    include_ccv: true,
    include_method_blank: false,
    include_calibration: false,
    is_active: true,
  });
  const [busy, setBusy] = useState(false);

  const [sftp, setSftp] = useState<SftpForm>({
    id: undefined,
    host: "",
    port: 22,
    username: "",
    password: "",
    private_key: "",
    remote_path: "/",
    is_active: true,
  });
  const [sftpBusy, setSftpBusy] = useState(false);

  useEffect(() => {
    if (sftpData) {
      setSftp({
        id: sftpData.id,
        host: sftpData.host ?? "",
        port: sftpData.port ?? 22,
        username: sftpData.username ?? "",
        password: sftpData.password ?? "",
        private_key: sftpData.private_key ?? "",
        remote_path: sftpData.remote_path ?? "/",
        is_active: sftpData.is_active,
      });
    }
  }, [sftpData]);

  useEffect(() => {
    if (data) {
      setForm({
        id: data.id,
        webhook_url: data.webhook_url ?? "",
        include_lcs: data.include_lcs,
        include_ccv: data.include_ccv,
        include_method_blank: data.include_method_blank,
        include_calibration: data.include_calibration,
        is_active: data.is_active,
      });
    }
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { ...form, webhook_url: form.webhook_url || null } });
      toast.success("Configuration saved");
      qc.invalidateQueries({ queryKey: qk.integrations.exportConfig() });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function saveSftpCfg() {
    setSftpBusy(true);
    try {
      await saveSftp({ data: {
        ...sftp,
        password: sftp.password || null,
        private_key: sftp.private_key || null,
      }});
      toast.success("SFTP configuration saved");
      qc.invalidateQueries({ queryKey: qk.integrations.sftpConfig() });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSftpBusy(false); }
  }

  const exportUrlBase = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/exports/`
    : "/api/public/exports/";

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">External Systems</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">Expose approved sample data to your downstream COA system.</p>
      </div>

      <ApiKeyCard apiKey={data?.api_key} exportUrlBase={exportUrlBase} />
      <ExportConfigForm form={form} onChange={setForm} />
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Configuration"}</Button>
      <SftpCard sftp={sftp} busy={sftpBusy} onChange={setSftp} onSave={saveSftpCfg} />
    </div>
  );
}