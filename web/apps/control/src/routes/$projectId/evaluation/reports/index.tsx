import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/features/evaluation-workbench/reports-page";
export const Route = createFileRoute("/$projectId/evaluation/reports/")({
  validateSearch: (search: Record<string, unknown>) => ({
    evaluationId:
      typeof search.evaluationId === "string" ? search.evaluationId : undefined,
  }),
  component: ReportsRoute,
});
function ReportsRoute() {
  const { evaluationId } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ReportsPage
      evaluationId={evaluationId ?? ""}
      onSelect={(id) => void navigate({ search: { evaluationId: id } })}
    />
  );
}
