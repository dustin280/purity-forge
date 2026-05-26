import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrepForm } from "@/components/mobile-phase/prep-form";
import {
  useMobilePhasePreps,
  useMobilePhaseReagents,
} from "@/components/mobile-phase/use-mobile-phase";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/lab-logs/mobile-phase/new")({
  component: NewMobilePhasePrep,
});

function NewMobilePhasePrep() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { createMut } = useMobilePhasePreps();
  const reagentsQ = useMobilePhaseReagents();

  const defaultName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || user?.email || "";
  const defaultInitials = (
    (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")
  ).toUpperCase() || (defaultName[0] ?? "").toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/lab-logs/mobile-phase">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to list
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">New Mobile Phase Prep</h1>
      </div>
      {reagentsQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading reagents…</div>
      ) : (
        <PrepForm
          defaultUserName={defaultName}
          defaultInitials={defaultInitials}
          reagents={reagentsQ.data ?? []}
          loading={createMut.isPending}
          onSubmit={(payload) =>
            createMut.mutate(payload, {
              onSuccess: (row) => navigate({ to: "/lab-logs/mobile-phase/$id", params: { id: row.id } }),
            })
          }
        />
      )}
    </div>
  );
}