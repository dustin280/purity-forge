import { createFileRoute } from "@tanstack/react-router";
import { CompoundMethodsPage } from "@/components/methods/compound-methods-page";

export const Route = createFileRoute("/_authenticated/methods/")({
  component: CompoundMethodsPage,
});
