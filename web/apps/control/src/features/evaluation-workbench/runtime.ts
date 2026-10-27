export interface EvaluationRuntime { standalone: boolean; projectId: string; apiBase: string }
declare global { interface Window { __EVALUATION_CONFIG__?: EvaluationRuntime } }
export function evaluationRuntime(): EvaluationRuntime {
  return typeof window !== 'undefined' && window.__EVALUATION_CONFIG__
    ? window.__EVALUATION_CONFIG__
    : { standalone: false, projectId: 'individual', apiBase: '/api/v1/evaluations' };
}
