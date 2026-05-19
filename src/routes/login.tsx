import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if verification is required.");
        nav({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error(r.error.message || "Google sign-in failed"); setBusy(false); return; }
    if (r.redirected) return;
    nav({ to: "/" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded bg-sidebar-primary grid place-items-center">
            <Activity className="size-5 text-sidebar-primary-foreground" />
          </div>
          <div className="text-white font-bold tracking-tight">QUANTUM LIMS</div>
        </div>
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
            <h2 className="text-2xl font-bold tracking-tight">{mode === "signin" ? "Sign in" : "Create account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Access the lab dashboard." : "The first registered user becomes admin."}
            </p>
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
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button variant="outline" onClick={google} disabled={busy} className="w-full">
            Continue with Google
          </Button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => setMode(m => m === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
