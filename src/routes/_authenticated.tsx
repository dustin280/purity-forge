/**
 * Pathless layout that gates every `/_authenticated/*` route behind a valid
 * Supabase session. `beforeLoad` redirects unauthenticated visitors to the
 * login page before any child loader runs; the component additionally syncs
 * with the `useAuth` context so client-side sign-outs trigger a redirect.
 * An `errorComponent` catches uncaught render/loader errors and offers retry.
 */
import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarNav, MobileTopBar } from "@/components/lims/sidebar-nav";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthedLayout,
  errorComponent: AuthedErrorBoundary,
});

function AuthedErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground break-words">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" onClick={() => router.navigate({ to: "/" })}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthedLayout() {
  const { loading, user } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Redirecting…</div>;
  return (
    <div className="min-h-screen flex bg-background">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar />
        <main className="flex-1 min-w-0 overflow-x-auto"><Outlet /></main>
      </div>
    </div>
  );
}
