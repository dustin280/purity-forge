import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ApiKeyCard } from "@/components/integrations/api-key-card";
import { ExportConfigForm } from "@/components/integrations/export-config-form";
import { SftpCard } from "@/components/integrations/sftp-card";
import { useExportConfig } from "@/components/integrations/use-export-config";
import { useSftpConfig } from "@/components/integrations/use-sftp-config";
export const Route = createFileRoute("/_authenticated/integrations")({ component: Integrations });

function Integrations() {
  const exportCfg = useExportConfig();
  const sftpCfg = useSftpConfig();

  const exportUrlBase = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/exports/`
    : "/api/public/exports/";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">External Systems</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">Expose approved sample data to your downstream COA system.</p>
      </div>

      <ApiKeyCard apiKey={exportCfg.apiKey} exportUrlBase={exportUrlBase} />
      <ExportConfigForm form={exportCfg.form} onChange={exportCfg.setForm} />
      <Button onClick={exportCfg.save} disabled={exportCfg.busy}>
        {exportCfg.busy ? "Saving…" : "Save Configuration"}
      </Button>
      <SftpCard sftp={sftpCfg.sftp} busy={sftpCfg.busy} onChange={sftpCfg.setSftp} onSave={sftpCfg.save} />
    </div>
  );
}