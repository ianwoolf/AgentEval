import { getAuthToken } from "@/lib/auth-token";
import type { Evaluation, EvaluationSnapshot } from "./contracts";
export interface Binding {
  target_id: string; dataset_id: string; dataset_version: number;
  environment_id: string; model_id: string; langfuse_dataset_id: string;
}
export interface RemoteRun {
  id: string; name: string; status: Evaluation["status"]; created_at: string;
  snapshot: EvaluationSnapshot; experiment_id: string; completed: number;
  phase: string; report_url?: string; error?: string; model_id: string;
  scorer_ids: string[]; scoring_mode: string; langfuse_experiment_id?: string;
}
export async function executionApi<T>(project: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(project)}/evaluation-execution/${path}`, { ...init, headers });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "Evaluation request failed");
  return value as T;
}
export function fromRemote(run: RemoteRun): Evaluation {
  return { id: run.id, name: run.name, createdAt: run.created_at, status: run.status,
    snapshot: run.snapshot, results: [], remote: run };
}
