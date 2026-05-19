import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getExportConfig, saveExportConfig, getSftpConfig, saveSftpConfig } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Webhook, Server } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integrations")({ component: Integrations });

function Integrations() {
  const qc = useQueryClient();
  const getFn = useServerFn(getExportConfig);
  const saveFn = useServerFn(saveExportConfig);
  const { data } = useQuery({ queryKey: ["export_config"], queryFn: () => getFn() });

  const getSftp = useServerFn(getSftpConfig);
  const saveSftp = useServerFn(saveSftpConfig);
  const { data: sftpData } = useQuery({ queryKey: ["sftp_config"], queryFn: () => getSftp() });

  const [form, setForm] = useState({
    id: undefined as string | undefined,
    webhook_url: "",
    include_lcs: true,
    include_ccv: true,
    include_method_blank: false,
    include_calibration: false,
    is_active: true,
  });
  const [busy, setBusy] = useState(false);

  const [sftp, setSftp] = useState({
    id: undefined as string | undefined,
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
      qc.invalidateQueries({ queryKey: ["export_config"] });
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
      qc.invalidateQueries({ queryKey: ["sftp_config"] });
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

      <Card className="p-5 border-border space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">API Key</h2>
        </div>
        <div className="space-y-1.5">
          <Label>Public ingestion endpoint</Label>
          <div className="flex gap-2">
            <Input readOnly value={`${exportUrlBase}{batch_id}`} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(`${exportUrlBase}{batch_id}`); toast.success("Copied"); }}>
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send <span className="font-mono">x-api-key</span> header. Returns JSON for approved samples.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>API Key</Label>
          <Input readOnly value={data?.api_key ?? "—"} className="font-mono text-xs" />
        </div>
      </Card>

      <Card className="p-5 border-border space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Push Webhook (optional)</h2>
        <div className="space-y-1.5">
          <Label htmlFor="hook">Webhook URL</Label>
          <Input id="hook" type="url" placeholder="https://your-coa-system.example.com/hook"
            value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })} />
          <p className="text-xs text-muted-foreground">Approved samples will be POSTed here as JSON.</p>
        </div>
      </Card>

      <Card className="p-5 border-border space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Data Stream Extras</h2>
        <p className="text-xs text-muted-foreground">Include additional QC data with each export.</p>
        {([
          ["include_lcs", "LCS Recovery"],
          ["include_ccv", "CCV Recovery"],
          ["include_method_blank", "Method Blank Spectra"],
          ["include_calibration", "Calibration Data"],
        ] as const).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between py-1">
            <Label htmlFor={k}>{label}</Label>
            <Switch id={k} checked={form[k]}
              onCheckedChange={v => setForm({ ...form, [k]: v })} />
          </div>
        ))}
        <div className="flex items-center justify-between py-1 border-t border-border pt-3">
          <Label htmlFor="active">Active</Label>
          <Switch id="active" checked={form.is_active}
            onCheckedChange={v => setForm({ ...form, is_active: v })} />
        </div>
      </Card>

      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Configuration"}</Button>

      <Card className="p-5 border-border space-y-4">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">SFTP Destination</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Stored credentials for an external worker that pushes approved exports to your SFTP server.
          The app itself does not open SFTP connections.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="sftp-host">Host</Label>
            <Input id="sftp-host" placeholder="sftp.example.com"
              value={sftp.host} onChange={e => setSftp({ ...sftp, host: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sftp-port">Port</Label>
            <Input id="sftp-port" type="number" min={1} max={65535}
              value={sftp.port} onChange={e => setSftp({ ...sftp, port: Number(e.target.value) || 22 })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-user">Username</Label>
          <Input id="sftp-user" autoComplete="off"
            value={sftp.username} onChange={e => setSftp({ ...sftp, username: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-pass">Password (optional)</Label>
          <Input id="sftp-pass" type="password" autoComplete="new-password" placeholder="Leave blank if using a key"
            value={sftp.password} onChange={e => setSftp({ ...sftp, password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-key">Private Key (optional)</Label>
          <Textarea id="sftp-key" rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className="font-mono text-xs"
            value={sftp.private_key} onChange={e => setSftp({ ...sftp, private_key: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-path">Remote Path</Label>
          <Input id="sftp-path" placeholder="/incoming/coa" className="font-mono text-xs"
            value={sftp.remote_path} onChange={e => setSftp({ ...sftp, remote_path: e.target.value })} />
        </div>
        <div className="flex items-center justify-between py-1 border-t border-border pt-3">
          <Label htmlFor="sftp-active">Active</Label>
          <Switch id="sftp-active" checked={sftp.is_active}
            onCheckedChange={v => setSftp({ ...sftp, is_active: v })} />
        </div>
        <Button onClick={saveSftpCfg} disabled={sftpBusy}>{sftpBusy ? "Saving…" : "Save SFTP Settings"}</Button>
      </Card>
    </div>
  );
}