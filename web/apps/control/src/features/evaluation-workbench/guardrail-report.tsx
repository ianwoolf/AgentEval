import { GuardrailScoreDashboard, type GuardrailSummary, type GroupComparison } from "./guardrail-score-dashboard";

export interface BindingResult {
  binding_id: string;
  aspect_name: string;
  dataset_id: string;
}

export function GuardrailReport({ evaluationId, running, report, groupComparison }: {
  evaluationId: string;
  running: boolean;
  report: GuardrailSummary;
  groupComparison?: GroupComparison | undefined;
}) {
  if (!report.overall) return null;
  return <section className="space-y-3" aria-label="Guardrail results">
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">Guardrail results</h2>
      <span className="text-xs text-muted-foreground">{running ? "Provisional results · " : ""}Cost is mock · Positive means unsafe</span>
    </div>
    <GuardrailScoreDashboard report={report} evaluationId={evaluationId} running={running} groupComparison={groupComparison}/>
  </section>;
}
