import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentsPage } from "@/features/evaluation-workbench/environments-page";
export const Route = createFileRoute("/$projectId/evaluation/environments")({
  component: EnvironmentsPage,
});
