/**
 * Pathless layout that gates every `/_authenticated/*` route behind a valid
 * Supabase session.
 *
 * IMPORTANT: the Supabase session lives only in browser `localStorage`
 * (`src/integrations/supabase/client.ts`) — there is no session cookie, so a
 * plain SSR page request has no way to identify the caller and `beforeLoad`
 * cannot redirect unauthenticated visitors server-side. Real protection is:
 *   1. `AuthedLayout` below never renders the sidebar/`Outlet` until
 *      `useAuth()` has resolved a confirmed session (shows a neutral
 *      "Loading…"/"Redirecting…" placeholder otherwise, both during SSR —
 *      where `loading` starts `true` and stays `true` — and after hydration).
 *   2. Every real data read/write goes through a `createServerFn` guarded by
 *      `requireSupabaseAuth`, which independently rejects requests without a
 *      valid bearer token.
 * Do NOT add a TanStack Router `loader` to a child route under this layout —
 * loaders can run during SSR before the client-side gate above ever mounts,
 * which would bypass both protections and let anonymous SSR requests fetch
 * data directly. Fetch data via `useQuery`/`useServerFn` inside components
 * instead, as every existing route under `_authenticated/` already does.
 */
import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarNav, MobileTopBar } from "@/components/lims/sidebar-nav";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { WorkflowGuideProvider } from "@/contexts/workflow-guide-context";
import { GuideOverlay } from "@/components/workflow-guide/guide-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // No-op during SSR: the session lives in localStorage only, so the server
    // has no way to read it here — see the module comment above for why, and
    // for the two mechanisms that actually enforce this gate.
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
    <TooltipProvider delayDuration={200}>
      <WorkflowGuideProvider>
        <div className="min-h-screen flex bg-background">
          <SidebarNav />
          <div className="flex-1 flex flex-col min-w-0">
            <MobileTopBar />
            <main className="flex-1 min-w-0 overflow-x-auto"><Outlet /></main>
          </div>
        </div>
        <GuideOverlay />
      </WorkflowGuideProvider>
    </TooltipProvider>
  );
}
