import { createFileRoute } from "@tanstack/react-router";
import { ScorersPage } from "@/features/evaluation-workbench/scorers-page";
export const Route = createFileRoute("/$projectId/evaluation/scorers")({
  component: ScorersPage,
});
