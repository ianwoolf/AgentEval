import { getAuthToken } from "@/lib/auth-token";
import type { Evaluation, EvaluationSnapshot } from "./contracts";
import { evaluationRuntime } from './runtime';
export interface RemoteRun {
  runtime?: 'docker' | 'kubernetes';
  container_name?: string | null;
  id: string; name: string; status: Evaluation["status"]; created_at: string;
  snapshot: EvaluationSnapshot; experiment_id: string; completed: number;
  phase: string; sample_count?: number; report_url?: string; error?: string; model_id: string;
  scorer_ids: string[]; scoring_mode: string;
}
export async function executionApi<T>(project: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const runtime = evaluationRuntime();
  const token = runtime.standalone ? null : getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (runtime.standalone) {
    headers.delete('Authorization');
    headers.set('X-Project-ID', runtime.projectId);
  }
  const base = runtime.standalone ? runtime.apiBase.replace(/\/$/, '') : `/api/v1/projects/${encodeURIComponent(project)}/evaluation-execution`;
  const response = await fetch(`${base}/${path}`, { ...init, headers });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(typeof value.detail === "string" ? value.detail : "Evaluation request failed"), {status: response.status});
  return value as T;
}
export function fromRemote(run: RemoteRun): Evaluation {
  return { id: run.id, name: run.name, createdAt: run.created_at, status: run.status,
    snapshot: run.snapshot, results: [], remote: run };
}
export async function executionPages<T>(project: string, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await executionApi<{items: T[]; total: number}>(project, `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=100`);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length < 100) return items;
  }
  throw new Error("Too many records. Narrow the query before loading more than 10,000 records.");
}

export interface TargetRunConfig {
 id: string; revision: string; dataset_id: string; dataset_version: number;
 environment_id: string; environment_version: number; model_id: string;
 data_source: "published" | "upload"; scoring_mode: "mock" | "installed"; scorer_ids: string[];
}
