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
};

/**
 * Encapsulates the SFTP-config server fetch, hydration into local form
 * state, and save mutation. The password and private_key are sent as
 * `null` when empty so the server can clear them.
 */
export function useSftpConfig() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSftpConfig);
  const saveFn = useServerFn(saveSftpConfig);
  const { data } = useQuery({ queryKey: qk.integrations.sftpConfig(), queryFn: () => getFn() });

  const [sftp, setSftp] = useState<SftpForm>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setSftp({
        id: data.id,
        host: data.host ?? "",
        port: data.port ?? 22,
        username: data.username ?? "",
        password: data.password ?? "",
        private_key: data.private_key ?? "",
        remote_path: data.remote_path ?? "/",
        is_active: data.is_active,
      });
    }
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: {
        ...sftp,
        password: sftp.password || null,
        private_key: sftp.private_key || null,
      }});
      toast.success("SFTP configuration saved");
      qc.invalidateQueries({ queryKey: qk.integrations.sftpConfig() });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return { sftp, setSftp, busy, save };
}