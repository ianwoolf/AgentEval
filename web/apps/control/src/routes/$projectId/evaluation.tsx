import { WorkbenchProvider } from "@/features/evaluation-workbench/provider";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerErrorBoundary } from "@/features/evaluation-layer/evaluation-layer-error-boundary";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";

export const Route = createFileRoute("/$projectId/evaluation")({
  component: EvaluationLayerLayout,
});

function EvaluationLayerLayout() {
  const { projectId } = Route.useParams();
  return (
    <EvaluationLayerProvider projectId={projectId}>
      <EvaluationLayerErrorBoundary>
        <WorkbenchProvider key={projectId}>
          <Outlet />
        </WorkbenchProvider>
      </EvaluationLayerErrorBoundary>
    </EvaluationLayerProvider>
  );
}
