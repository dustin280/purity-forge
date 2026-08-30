import { createFileRoute } from "@tanstack/react-router";
import { NonchromWorklistPage } from "@/components/nonchrom/nonchrom-worklist-page";

export const Route = createFileRoute("/_authenticated/non-hplc-results/heavy-metals")({
  component: () => <NonchromWorklistPage testType="heavy_metals" />,
});
