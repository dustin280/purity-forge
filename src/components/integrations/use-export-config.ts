import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getExportConfig, saveExportConfig } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";
import type { ExportConfigForm } from "./export-config-form";

const initial: ExportConfigForm = {
  id: undefined,
  webhook_url: "",
  include_lcs: true,
  include_ccv: true,
  include_method_blank: false,
  include_calibration: false,
  is_active: true,
};

/**
 * Encapsulates the export-config server fetch, local form state hydration,
 * and save mutation. Exposes the form, change setter, save handler, busy
 * flag, and the raw `apiKey` (read-only field rendered separately).
 */
export function useExportConfig() {
  const qc = useQueryClient();
  const getFn = useServerFn(getExportConfig);
  const saveFn = useServerFn(saveExportConfig);
  const { data } = useQuery({ queryKey: qk.integrations.exportConfig(), queryFn: () => getFn() });

  const [form, setForm] = useState<ExportConfigForm>(initial);
  const [busy, setBusy] = useState(false);

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

  return { form, setForm, busy, save, apiKey: data?.api_key };
}