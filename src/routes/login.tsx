import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import synthesyxLogo from "@/assets/synthesyx-logo.svg";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <img
          src={synthesyxLogo}
          alt="Synthesyx"
          className="h-10 w-auto"
          style={{ filter: "invert(1) brightness(2)" }}
        />
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-3">Analytical precision, regulated workflow.</h1>
          <p className="text-sidebar-foreground/70 max-w-md">
            Peptide and pharmaceutical purity testing on Agilent 1290 Infinity III with DAD detection.
            Sample intake → HPLC analysis → reviewer approval → COA export.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
          21 CFR Part 11 ready · Audit trail enabled
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">Access is invite-only. Contact your administrator for an account.</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
