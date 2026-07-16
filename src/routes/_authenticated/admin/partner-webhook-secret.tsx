import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, RefreshCw, Copy, Check, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getPartnerWebhookSecretStatus,
  rotatePartnerWebhookSecret,
  revokeDeprecatedPartnerWebhookSecrets,
} from "@/lib/partner-webhook-secret.functions";

export const Route = createFileRoute("/_authenticated/admin/partner-webhook-secret")({
  component: PartnerWebhookSecretAdmin,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function PartnerWebhookSecretAdmin() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState<{ secret: string; graceUntil: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["partner-webhook-secret-status"],
    queryFn: () => getPartnerWebhookSecretStatus(),
    enabled: isAdmin,
  });

  const rotateMut = useMutation({
    mutationFn: () => rotatePartnerWebhookSecret({ data: { graceHours: 48 } }),
    onSuccess: (r) => {
      setRevealed({ secret: r.secret, graceUntil: r.graceUntil });
      setCopied(false);
      qc.invalidateQueries({ queryKey: ["partner-webhook-secret-status"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Rotate failed"),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeDeprecatedPartnerWebhookSecrets(),
    onSuccess: () => {
      toast.success("Previous secret revoked");
      qc.invalidateQueries({ queryKey: ["partner-webhook-secret-status"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Revoke failed"),
  });

  if (!isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Admins only.</div>;
  }

  const rows = statusQuery.data?.rows ?? [];
  const active = rows.find((r) => r.status === "active");
  const deprecated = rows.filter((r) => r.status === "deprecated");
  const envFallbackInUse = statusQuery.data?.envFallbackInUse ?? false;

  const copySecret = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
      toast.success("Secret copied to clipboard");
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <KeyRound className="size-6" /> Partner Webhook Secret
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The shared secret partners use to sign order intake webhooks. Rotate here to issue a new value;
          the previous secret keeps working for 48 hours so partners can swap it in without dropped requests.
        </p>
      </div>

      {envFallbackInUse && (
        <Alert className="mb-4">
          <ShieldAlert className="size-4" />
          <AlertTitle>No managed secret configured yet</AlertTitle>
          <AlertDescription>
            The webhook is currently accepting requests signed with the legacy environment-variable secret.
            Click <strong>Rotate secret</strong> to generate a managed secret you can rotate from this page.
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Current secret</CardTitle>
          <Button size="sm" onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending}>
            <RefreshCw className={`size-4 mr-2 ${rotateMut.isPending ? "animate-spin" : ""}`} />
            {active ? "Rotate secret" : "Generate secret"}
          </Button>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : active ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd><Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Active</Badge></dd>
              <dt className="text-muted-foreground">Fingerprint</dt>
              <dd className="font-mono">{active.secret_preview}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(active.created_at)}{active.created_by_name ? ` by ${active.created_by_name}` : ""}</dd>
              <dt className="text-muted-foreground">Last verified</dt>
              <dd>{formatDate(active.last_verified_at)}</dd>
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground">No managed secret yet.</div>
          )}
        </CardContent>
      </Card>

      {deprecated.length > 0 && (
        <Card className="mb-4 border-amber-500/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Previous secret (grace window)</CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Trash2 className="size-4 mr-2" /> Revoke now
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke previous secret?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Any webhook still signed with the previous secret will be rejected immediately.
                    Only do this once the partner has confirmed they're using the new secret.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revokeMut.mutate()}>Revoke</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {deprecated.map((r) => (
              <dl key={r.id} className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Fingerprint</dt>
                <dd className="font-mono">{r.secret_preview}</dd>
                <dt className="text-muted-foreground">Deprecated</dt>
                <dd>{formatDate(r.deprecated_at)}</dd>
                <dt className="text-muted-foreground">Grace ends</dt>
                <dd>{formatDate(r.grace_until)}</dd>
                <dt className="text-muted-foreground">Last verified</dt>
                <dd>{formatDate(r.last_verified_at)}</dd>
              </dl>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Integration reference</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            <span className="text-muted-foreground">Webhook URL:</span>{" "}
            <code className="font-mono">/api/public/orders/intake</code>
          </div>
          <div className="text-muted-foreground">
            Signature header: <code className="font-mono">x-signature</code> = HMAC-SHA256(secret, raw body), hex.
          </div>
          <div className="text-muted-foreground">
            Send the value shown once after rotation to your partner's development team.
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New secret generated</DialogTitle>
            <DialogDescription>
              Copy this value now — it will not be shown again. The previous secret keeps working until{" "}
              <strong>{revealed ? formatDate(revealed.graceUntil) : ""}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-xs break-all">
            {revealed?.secret}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copySecret}>
              {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
              {copied ? "Copied" : "Copy secret"}
            </Button>
            <Button onClick={() => setRevealed(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}