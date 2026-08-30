import { createFileRoute } from "@tanstack/react-router";
import { NonchromWorklistPage } from "@/components/nonchrom/nonchrom-worklist-page";

export const Route = createFileRoute("/_authenticated/non-hplc-results/endotoxin")({
  component: () => <NonchromWorklistPage testType="endotoxin" />,
});
