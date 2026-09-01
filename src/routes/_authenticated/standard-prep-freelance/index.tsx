import { createFileRoute } from "@tanstack/react-router";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { analystInitials } from "@/lib/lims-utils";
import { StandardPrepFreelanceFlow } from "@/components/standard-preparations/standard-prep-freelance-flow";

export const Route = createFileRoute("/_authenticated/standard-prep-freelance/")({
  component: StandardPrepFreelancePage,
});

function StandardPrepFreelancePage() {
  const { profile, user } = useAuth();
  const defaultAnalystName = profileDisplayName(profile, null);
  const userToken = analystInitials(profile, user?.email ?? null);
  return <StandardPrepFreelanceFlow defaultAnalystName={defaultAnalystName} userToken={userToken} />;
}
