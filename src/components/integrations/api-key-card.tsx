import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Webhook } from "lucide-react";
import { toast } from "sonner";

/**
 * Read-only display of the public ingestion endpoint and the API key that
 * downstream COA systems use to pull approved sample data.
 */
export function ApiKeyCard({ apiKey, exportUrlBase }: { apiKey: string | null | undefined; exportUrlBase: string }) {
  const template = `${exportUrlBase}{batch_id}`;
  return (
    <Card className="p-5 border-border space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">API Key</h2>
      </div>
      <div className="space-y-1.5">
        <Label>Public ingestion endpoint</Label>
        <div className="flex gap-2">
          <Input readOnly value={template} className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => { navigator.clipboard.writeText(template); toast.success("Copied"); }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Send <span className="font-mono">x-api-key</span> header. Returns JSON for approved samples.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>API Key</Label>
        <Input readOnly value={apiKey ?? "—"} className="font-mono text-xs" />
      </div>
    </Card>
  );
}