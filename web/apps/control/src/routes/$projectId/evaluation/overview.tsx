import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationOverviewPage } from "@/features/evaluation-layer/overview/overview-page";

export const Route = createFileRoute("/$projectId/evaluation/overview")({
  component: EvaluationOverview,
});

function EvaluationOverview() {
  return (
    <EvaluationLayerPageFrame title="Dashboard" description="Operational visibility across evaluation traces.">
      <EvaluationOverviewPage />
    </EvaluationLayerPageFrame>
  );
}
