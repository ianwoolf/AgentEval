import { createFileRoute } from "@tanstack/react-router";
import { EvalPage } from "@/features/evaluation-workbench/eval-page";
export const Route = createFileRoute("/$projectId/evaluation/catalog")({
  component: EvalPage,
});
