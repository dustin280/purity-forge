import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSftpConfig, saveSftpConfig } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";
import type { SftpForm } from "./sftp-card";

const initial: SftpForm = {
  id: undefined,
  host: "",
  port: 22,
  username: "",
  password: "",
  private_key: "",
  remote_path: "/",
  is_active: true,
  hasPassword: false,
  hasPrivateKey: false,
};

/**
 * Encapsulates the SFTP-config server fetch, hydration into local form
 * state, and save mutation. The server never sends the real password/private
 * key back to the browser (see getSftpConfig) — the form only shows whether
 * one is on file. `passwordTouched`/`privateKeyTouched` track whether the
 * user actually edited a field this session: untouched fields are omitted
 * from the save payload (existing secret left alone); a touched-and-emptied
 * field explicitly clears it.
 */
export function useSftpConfig() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSftpConfig);
  const saveFn = useServerFn(saveSftpConfig);
  const { data } = useQuery({ queryKey: qk.integrations.sftpConfig(), queryFn: () => getFn() });

  const [sftp, setSftp] = useState<SftpForm>(initial);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [privateKeyTouched, setPrivateKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setSftp({
        id: data.id,
        host: data.host ?? "",
        port: data.port ?? 22,
        username: data.username ?? "",
        password: "",
        private_key: "",
        remote_path: data.remote_path ?? "/",
        is_active: data.is_active,
        hasPassword: data.has_password,
        hasPrivateKey: data.has_private_key,
      });
      setPasswordTouched(false);
      setPrivateKeyTouched(false);
    }
  }, [data]);

  function onChange(next: SftpForm) {
    if (next.password !== sftp.password) setPasswordTouched(true);
    if (next.private_key !== sftp.private_key) setPrivateKeyTouched(true);
    setSftp(next);
  }

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: {
        id: sftp.id,
        host: sftp.host,
        port: sftp.port,
        username: sftp.username,
        remote_path: sftp.remote_path,
        is_active: sftp.is_active,
        ...(passwordTouched ? { password: sftp.password || null } : {}),
        ...(privateKeyTouched ? { private_key: sftp.private_key || null } : {}),
      }});
      toast.success("SFTP configuration saved");
      qc.invalidateQueries({ queryKey: qk.integrations.sftpConfig() });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return { sftp, setSftp: onChange, busy, save };
}
