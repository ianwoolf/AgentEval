import { createFileRoute } from "@tanstack/react-router";
import { DatasetsPage } from "@/features/evaluation-workbench/datasets-page";
export const Route = createFileRoute("/$projectId/evaluation/datasets/")({
  component: DatasetsPage,
});
