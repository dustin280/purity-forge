import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Server } from "lucide-react";

export type SftpForm = {
  id: string | undefined;
  host: string;
  port: number;
  username: string;
  password: string;
  private_key: string;
  remote_path: string;
  is_active: boolean;
};

/**
 * Stored credentials for an external worker that pushes approved exports to
 * an SFTP destination. The app itself never opens SFTP connections.
 */
export function SftpCard({
  sftp,
  busy,
  onChange,
  onSave,
}: {
  sftp: SftpForm;
  busy: boolean;
  onChange: (next: SftpForm) => void;
  onSave: () => void;
}) {
  return (
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
          <Input
            id="sftp-host"
            placeholder="sftp.example.com"
            value={sftp.host}
            onChange={e => onChange({ ...sftp, host: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-port">Port</Label>
          <Input
            id="sftp-port"
            type="number"
            min={1}
            max={65535}
            value={sftp.port}
            onChange={e => onChange({ ...sftp, port: Number(e.target.value) || 22 })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sftp-user">Username</Label>
        <Input
          id="sftp-user"
          autoComplete="off"
          value={sftp.username}
          onChange={e => onChange({ ...sftp, username: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sftp-pass">Password (optional)</Label>
        <Input
          id="sftp-pass"
          type="password"
          autoComplete="new-password"
          placeholder="Leave blank if using a key"
          value={sftp.password}
          onChange={e => onChange({ ...sftp, password: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sftp-key">Private Key (optional)</Label>
        <Textarea
          id="sftp-key"
          rows={4}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          className="font-mono text-xs"
          value={sftp.private_key}
          onChange={e => onChange({ ...sftp, private_key: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sftp-path">Remote Path</Label>
        <Input
          id="sftp-path"
          placeholder="/incoming/coa"
          className="font-mono text-xs"
          value={sftp.remote_path}
          onChange={e => onChange({ ...sftp, remote_path: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between py-1 border-t border-border pt-3">
        <Label htmlFor="sftp-active">Active</Label>
        <Switch
          id="sftp-active"
          checked={sftp.is_active}
          onCheckedChange={v => onChange({ ...sftp, is_active: v })}
        />
      </div>
      <Button onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save SFTP Settings"}</Button>
    </Card>
  );
}