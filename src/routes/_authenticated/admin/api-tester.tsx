import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Loader2, ShieldAlert, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getApiTesterConfig,
  testKeyedEndpoint,
  testOrderIntake,
} from "@/lib/api-tester.functions";

export const Route = createFileRoute("/_authenticated/admin/api-tester")({
  component: SynApiTester,
});

type Env = "production" | "staging";

type CallResult = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  body: string;
  signaturePreview?: string;
};

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    externalOrderId: `TEST-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`,
    customer: {
      id: "CUST-789",
      name: "John Doe",
      email: "john@example.com",
      company: "Research Lab LLC",
    },
    orderDate: new Date().toISOString(),
    shipping: { trackingNumber: "9400111899223856789012", carrier: "USPS" },
    samples: [
      { sampleId: "SMP-001", productName: "BPC-157 5mg", quantity: 1, lotBatch: "HG2412825", notes: "Purity + net peptide" },
    ],
    specialInstructions: "Test order from Syn API Tester",
  },
  null,
  2,
);

function prettify(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function ResultPanel({ result }: { result: CallResult | null }) {
  const [copied, setCopied] = useState(false);
  if (!result) {
    return (
      <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
        Run a request to see the response here.
      </div>
    );
  }
  const tone = result.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-xs font-mono ${tone}`}>
          {result.status} {result.statusText}
        </span>
        <Badge variant="outline" className="font-mono text-[11px]">{result.durationMs} ms</Badge>
        <span className="text-xs text-muted-foreground font-mono break-all">{result.method} {result.url}</span>
      </div>
      {result.signaturePreview && (
        <div className="text-xs text-muted-foreground font-mono">x-signature: {result.signaturePreview}</div>
      )}
      <div className="relative">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="absolute right-2 top-2 h-7"
          onClick={() => {
            navigator.clipboard.writeText(result.body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
        <pre className="bg-muted/40 border border-border rounded-md p-3 text-xs overflow-auto max-h-[420px] whitespace-pre-wrap break-all">
          {prettify(result.body) || "(empty body)"}
        </pre>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Headers</summary>
        <pre className="mt-2 whitespace-pre-wrap break-all">
          {JSON.stringify({ request: result.requestHeaders, response: result.responseHeaders }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SynApiTester() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [env, setEnv] = useState<Env>("staging");
  const [body, setBody] = useState(SAMPLE_PAYLOAD);
  const [tamper, setTamper] = useState(false);
  const [omitSig, setOmitSig] = useState(false);
  const [intakeResult, setIntakeResult] = useState<CallResult | null>(null);

  const [batchId, setBatchId] = useState("");
  const [client, setClient] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(25);
  const [omitKey, setOmitKey] = useState(false);
  const [keyedResult, setKeyedResult] = useState<CallResult | null>(null);

  const cfg = useQuery({
    queryKey: ["api-tester-config"],
    queryFn: () => getApiTesterConfig(),
    enabled: isAdmin,
  });

  const intakeMut = useMutation({
    mutationFn: () =>
      testOrderIntake({ data: { env, body, tamperSignature: tamper, omitSignature: omitSig } }),
    onSuccess: (r) => setIntakeResult(r as CallResult),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  const keyedMut = useMutation({
    mutationFn: (kind: "status_list" | "status_one" | "export") =>
      testKeyedEndpoint({ data: { env, kind, batchId, client, since, limit, omitKey } }),
    onSuccess: (r) => setKeyedResult(r as CallResult),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  if (!isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Admins only.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Admin
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">Syn API Tester</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exercise the partner-facing API end to end. Requests are signed and sent server-side, so the
          webhook secret and API key never reach the browser.
        </p>
      </div>

      {cfg.data && (!cfg.data.hasWebhookSecret || !cfg.data.hasApiKey || !cfg.data.exportsActive) && (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Configuration incomplete</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            {!cfg.data.hasWebhookSecret && <div>No active partner webhook secret — rotate one under Partner Webhook Secret.</div>}
            {!cfg.data.hasApiKey && <div>No export API key — set one under Integrations.</div>}
            {cfg.data.hasApiKey && !cfg.data.exportsActive && <div>Exports are disabled; keyed endpoints will return 403.</div>}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Target environment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={env} onValueChange={(v) => setEnv(v as Env)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="staging">Staging (preview)</SelectItem>
              <SelectItem value="production">Production (syxlab.org)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground font-mono break-all">{cfg.data?.bases?.[env]}</span>
          {env === "production" && (
            <Badge variant="destructive" className="text-[10px]">Writes real pending orders</Badge>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="intake">
        <TabsList>
          <TabsTrigger value="intake">Order Intake</TabsTrigger>
          <TabsTrigger value="status">Status API</TabsTrigger>
          <TabsTrigger value="exports">Exports API</TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-mono">POST /api/public/orders/intake</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Request body (JSON)</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="font-mono text-xs" />
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={tamper} onCheckedChange={setTamper} /> Corrupt signature (expect 401)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={omitSig} onCheckedChange={setOmitSig} /> Omit signature header (expect 401)
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => intakeMut.mutate()} disabled={intakeMut.isPending}>
                  {intakeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Send request
                </Button>
                <Button variant="outline" onClick={() => setBody(SAMPLE_PAYLOAD)}>Reset payload</Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setBody((b) =>
                      b.replace(/"externalOrderId":\s*"[^"]*"/, `"externalOrderId": "TEST-${Date.now()}"`),
                    )
                  }
                >
                  New order id
                </Button>
              </div>
              <ResultPanel result={intakeResult} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-mono">GET /api/public/status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Batch ID (single lookup)</Label>
                  <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="SYX-000123-01" />
                </div>
                <div className="space-y-2">
                  <Label>Client filter (bulk)</Label>
                  <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Research Lab LLC" />
                </div>
                <div className="space-y-2">
                  <Label>Since (ISO timestamp)</Label>
                  <Input value={since} onChange={(e) => setSince(e.target.value)} placeholder="2026-07-11T13:44:00Z" />
                </div>
                <div className="space-y-2">
                  <Label>Limit</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={limit}
                    onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={omitKey} onCheckedChange={setOmitKey} /> Omit x-api-key (expect 401)
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => keyedMut.mutate("status_list")} disabled={keyedMut.isPending}>
                  {keyedMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Bulk feed
                </Button>
                <Button variant="outline" onClick={() => keyedMut.mutate("status_one")} disabled={keyedMut.isPending || !batchId}>
                  Single batch
                </Button>
              </div>
              <ResultPanel result={keyedResult} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-mono">GET /api/public/exports/:batchId</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Batch ID or partner lot</Label>
                <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="SYX-000123-01 or HG2412825" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={omitKey} onCheckedChange={setOmitKey} /> Omit x-api-key (expect 401)
              </label>
              <Button onClick={() => keyedMut.mutate("export")} disabled={keyedMut.isPending || !batchId}>
                {keyedMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Fetch export
              </Button>
              <ResultPanel result={keyedResult} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
