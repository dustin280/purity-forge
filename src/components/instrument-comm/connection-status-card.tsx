import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cable } from "lucide-react";
import { toast } from "sonner";
import { syncOpenLabIndex } from "@/lib/openlab.functions";
import { qk } from "@/lib/query-keys";
import { useOpenLabSettings } from "./use-openlab";
import { useAuth } from "@/hooks/use-auth";

export function ConnectionStatusCard() {
  const { data, isLoading } = useOpenLabSettings();
  const { role } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(syncOpenLabIndex);
  const m = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`Synced: ${r.methods} methods, ${r.sequences} sequences`);
      qc.invalidateQueries({ queryKey: ["openlab"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const status = data?.status ?? "not_configured";
  const dot =
    status === "connected"
      ? "bg-emerald-500"
      : status === "disconnected"
      ? "bg-amber-500"
      : "bg-muted-foreground";
  const label =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
      ? "Disconnected (no data synced)"
      : "Not configured";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="size-4" /> OpenLab CDS Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span className={`inline-block size-2.5 rounded-full ${dot}`} />
          <span className="font-medium">{label}</span>
          <Badge variant="secondary" className="ml-auto">
            {data?.counts.methods ?? 0} methods · {data?.counts.sequences ?? 0} sequences
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Project folder:{" "}
            <span className="font-mono">
              {data?.settings?.project_folder_path || "—"}
            </span>
          </div>
          <div>
            Storage prefix:{" "}
            <span className="font-mono">
              {data?.settings?.storage_prefix || "default/"}
            </span>
          </div>
          <div>
            Last sync:{" "}
            {data?.settings?.last_synced_at
              ? new Date(data.settings.last_synced_at).toLocaleString()
              : "never"}
          </div>
        </div>
        {role === "admin" && (
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={m.isPending || isLoading}
          >
            <RefreshCw
              className={`size-4 mr-2 ${m.isPending ? "animate-spin" : ""}`}
            />
            Sync now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}