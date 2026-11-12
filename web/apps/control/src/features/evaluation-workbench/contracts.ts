/** UI DTOs for the proposed v2 API. This module performs no network requests. */
export type Value =
  string | number | boolean | null | Value[] | { [key: string]: Value };
export type Row = Record<string, Value>;
export interface Field {
  name: string;
  type: "string" | "number" | "boolean" | "json";
  role: "input" | "reference" | "metadata";
  required: boolean;
  description: string;
}
export interface DatasetContent {
  evaluation_type?: 'generic' | 'guardrail';
  guardrail?: {
    label_mapping: Record<string, 'safe' | 'unsafe'>;
    scorer_id: string;
    scorer_version: number;
    aspect_id: string;
    aspect_name: string;
  };
  scorerIds?: string[];
  name: string;
  objective: string;
  description: string;
  tags: string[];
  targets?: string[];
  metadata: Record<string, Value>;
  fields: Field[];
  rows: Row[];
}
export interface DatasetVersion extends DatasetContent {
  version: number;
  publishedAt: string;
}
export interface Dataset {
  id: string;
  revision?: string;
  draft: DatasetContent;
  versions: DatasetVersion[];
}
export interface EnvironmentConfig {
  modelId: string;
  guardrailId: string;
  runner: { id: string; concurrency: number };
  name: string;
  description: string;
  type: "SANDBOX";
  network: string[];
  readOnlyPaths: string[];
  writablePaths: string[];
  commands: string[];
  cpuMillicores: number;
  memoryMiB: number;
  timeoutSeconds: number;
  interceptLlm: true;
  interceptGuardrail: true;
}
export interface EnvironmentVersion extends EnvironmentConfig {
  version: number;
  publishedAt: string;
}
export interface Environment {
  id: string;
  revision?: string;
  versions: EnvironmentVersion[];
}
export interface ScorerConfig {
  execution?: import("./execution-editor").ExecutionConfig;
  criteria?: import("./criteria").EvaluationCriteria;
  name: string;
  description: string;
  kind: "LLM_JUDGE" | "CODE" | "RULE";
  definition: string;
  repoUrl?: string;
  scriptPath?: string;
  threshold: number;
  notes: string;
}
export interface ScorerVersion extends ScorerConfig {
  version: number;
  publishedAt: string;
}
export interface Scorer {
  revision?: string;
  id: string;
  source: "BUILT_IN" | "CUSTOM";
  enabled: boolean;
  draft: ScorerConfig;
  versions: ScorerVersion[];
}
export interface Target {
  evaluation_config?: import("./remote").TargetRunConfig;
  guardrail_id?: string | null;
  revision?: string;
  id: string;
  provider?: string;
  name: string;
  kind: "PROMPT" | "GUARDRAIL";
  version: number;
  definition: string;
}
export interface CreateEvaluationRequest {
  name: string;
  targetId: string;
  datasetId: string;
  datasetVersion: number;
  environmentId: string;
  scorerIds: string[];
}
export interface EvaluationSnapshot {
  target: Target;
  datasetId: string;
  dataset: DatasetVersion;
  environmentId: string;
  environment: EnvironmentVersion;
  scorers: Array<ScorerVersion & { id: string; source: Scorer["source"] }>;
}
export interface Score {
  scorerId: string;
  value: number;
  passed: boolean;
  reason: string;
}
export interface GuardrailRequestResult {
  request_id: string;
  binding_ids: string[];
  strategy: string;
  status: string;
  http_status?: number;
  guardrail_latency_ms: number;
  scorer_latency_ms: number;
  cost: { amount: number };
  classifications: { binding_id: string; outcome: string; reason: string }[];
}

export interface SampleResult {
  guardrail_result?: GuardrailRequestResult | null;
  dataset_id?: string;
  dataset_version?: number;
  id: string;
  input: Row;
  reference: Row;
  output: Row;
  status: "PASS" | "FAIL" | "ERROR";
  error: string | null;
  latencyMs: number;
  costUsd: number;
  scores: Score[];
  trace: Array<{
    name: string;
    kind: "SANDBOX" | "LLM" | "GUARDRAIL" | "SCORER";
    durationMs: number;
    detail: string;
  }>;
}
export interface Evaluation {
  id: string;
  name: string;
  createdAt: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
  remote?: import("./remote").RemoteRun;
  snapshot: EvaluationSnapshot;
  results: SampleResult[];
}
export interface WorkbenchState {
  datasets: Dataset[];
  environments: Environment[];
  scorers: Scorer[];
  targets: Target[];
  evaluations: Evaluation[];
}
export interface ApiError {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    requestId: string;
  };
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Proposed wire contract: unlike the UI form, every dependency is explicitly pinned. */
export interface VersionRef {
  id: string;
  version: number;
}
export interface StartEvaluationV2Request {
  name: string;
  target: VersionRef;
  dataset: VersionRef;
  environment: VersionRef;
  scorers: VersionRef[];
  fieldMapping: Record<string, string>;
  metadata: Record<string, Value>;
}
export interface EvaluationEvent {
  sequence: number;
  evaluationId: string;
  type:
    | "evaluation.started"
    | "sample.completed"
    | "sample.failed"
    | "evaluation.completed"
    | "evaluation.failed"
    | "evaluation.cancelled";
  at: string;
  data: Record<string, Value>;
}
