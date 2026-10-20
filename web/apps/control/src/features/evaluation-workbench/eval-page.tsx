import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { useCurrentProjectId } from "@/hooks/use-project";
import type { CreateEvaluationRequest } from "./contracts";
import { executionApi, fromRemote, type Binding, type RemoteRun } from "./remote";
import { createEvaluation } from "./domain";
import { useWorkbench } from "./provider";
import {
  Button,
  Empty,
  ErrorText,
  Field,
  Frame,
  Input,
  Modal,
  Pill,
  Select,
  Table,
} from "./ui";
export function EvalPage() {
  const navigate = useNavigate();
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const [filter, setFilter] = useState("ALL");
  const [targetType, setTargetType] = useState("GUARDRAIL");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const targets = state.targets.filter((target) => target.kind === targetType);
  const runs = state.evaluations.filter(
    (e) => (!historyTargetId || e.snapshot.target.id === historyTargetId) &&
      (filter === "ALL" || e.status === filter),
  );
  return (
    <Frame
      title="Evaluation"
      description="Choose a target type, inspect its targets, then configure and run an evaluation."
    >
      <div className="flex items-end justify-between gap-4">
        <Field label="Target type">
          <Select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="GUARDRAIL">Guardrail</option>
          </Select>
        </Field>
        <p className="text-sm text-muted-foreground">{targets.length} target{targets.length === 1 ? "" : "s"}</p>
      </div>
      <Table>
        <thead><tr><th>Target</th><th>Type</th><th>Version</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>
          {targets.map((target) => (
            <tr key={target.id}>
              <td><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><p className="font-medium">{target.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{target.id}</p></div></div></td>
              <td><Pill>Guardrail</Pill></td>
              <td>v{target.version}</td>
              <td className="max-w-md text-muted-foreground">{target.definition}</td>
              <td><div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setHistoryTargetId(target.id);
                  setFilter("ALL");
                }}>History</Button>
                <Button onClick={() => setSelectedTargetId(target.id)}><Play />Trigger</Button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!targets.length && <Empty>No targets available for this type.</Empty>}
      {selectedTargetId && <CreateEvalDialog key={selectedTargetId} targetId={selectedTargetId}
        onStarted={(id) => { void navigate({ to: "/$projectId/evaluation/reports", params: { projectId }, search: { evaluationId: id } }); }}
        onClose={() => setSelectedTargetId(null)} />}
      {historyTargetId && (
      <Modal
        title="Evaluation history"
        description={state.targets.find((t) => t.id === historyTargetId)?.name ?? historyTargetId}
        onClose={() => setHistoryTargetId(null)}
      >
      <div className="flex justify-end">
        <Select
          aria-label="Evaluation status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>
      {runs.length ? (
        <Table>
          <thead>
            <tr>
              <th>Evaluation</th>
              <th>Target</th>
              <th>Dataset</th>
              <th>Environment</th>
              <th>Progress</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link
                    className="font-medium hover:underline"
                    to="/$projectId/evaluation/reports"
                    params={{ projectId }}
                    search={{ evaluationId: run.id }}
                  >
                    {run.name}
                  </Link>
                  <p
                    className="mt-1 max-w-60 truncate font-mono text-xs text-muted-foreground"
                    title={run.id}
                  >
                    {run.id}
                  </p>
                </td>
                <td>
                  <p>{run.snapshot.target.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.snapshot.target.kind} · v{run.snapshot.target.version}
                  </p>
                </td>
                <td>
                  {run.snapshot.dataset.name}
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{run.snapshot.dataset.version}
                  </p>
                </td>
                <td>
                  {run.snapshot.environment.name}
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{run.snapshot.environment.version}
                  </p>
                </td>
                <td>
                  <div className="min-w-24">
                    <progress
                      className="h-1.5 w-full accent-primary"
                      value={run.remote?.completed ?? run.results.length}
                      max={run.snapshot.dataset.rows.length}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.remote?.completed ?? run.results.length}/{run.snapshot.dataset.rows.length}{" "}
                      samples
                    </p>
                  </div>
                </td>
                <td>
                  <Pill tone={run.status === "COMPLETED" ? "good" : "neutral"}>
                    {run.status}
                  </Pill>
                </td>
                <td>
                  {run.status === "RUNNING" && !run.remote ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          evaluations: s.evaluations.map((e) =>
                            e.id === run.id && e.status === "RUNNING"
                              ? { ...e, status: "CANCELLED" }
                              : e,
                          ),
                        }))
                      }
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="ghost" asChild>
                      <Link
                        to="/$projectId/evaluation/reports"
                        params={{ projectId }}
                        search={{ evaluationId: run.id }}
                      >
                        Report
                        <ArrowRight />
                      </Link>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>
          No evaluations match this status for this target.
        </Empty>
      )}
      </Modal>
      )}
    </Frame>
  );
}
export function CreateEvalDialog({ onClose, targetId, onStarted }: { onClose(): void; targetId?: string; onStarted?(id: string): void }) {
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const firstDataset = state.datasets.find((d) => d.versions.length);
  const defaultScorerIds = (ids?: string[]) => state.scorers
    .filter((s) => s.enabled && s.versions.length && (!ids?.length || ids.includes(s.id)))
    .map((s) => s.id);
  const [request, setRequest] = useState<CreateEvaluationRequest>({
    name: "",
    targetId: targetId ?? state.targets.find((t) => t.kind === "GUARDRAIL")?.id ?? "",
    datasetId: firstDataset?.id ?? "",
    datasetVersion: firstDataset?.versions.at(-1)?.version ?? 0,
    environmentId: state.environments[0]?.id ?? "",
    scorerIds: defaultScorerIds(firstDataset?.versions.at(-1)?.scorerIds),
  });
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    executionApi<{bindings: Binding[]}>(projectId, "config")
      .then(config => { if (active) setBindings(config.bindings); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId]);
  const patch = (value: Partial<CreateEvaluationRequest>) => {
    idempotencyKey.current = crypto.randomUUID();
    setRequest((r) => ({ ...r, ...value }));
    setError("");
  };
  const dataset = state.datasets.find((d) => d.id === request.datasetId);
  const version = dataset?.versions.find(
    (v) => v.version === request.datasetVersion,
  );
  const environment = state.environments
    .find((e) => e.id === request.environmentId)
    ?.versions.at(-1);
  return (
    <Modal
      title="Configure evaluation"
      description="Run a real Kubernetes evaluation with Langfuse datasets and reporting. Scoring currently uses an explicit development mock."
      footer={<>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onClose}
        >
          Cancel
        </Button>
          <Button
            disabled={busy || !bindings.length}
            onClick={async () => {
              if (submitted.current) return;
              submitted.current = true;
              setBusy(true);
              try {
                const evaluation = createEvaluation(state, request);
                const binding = bindings.find(b => b.target_id === request.targetId && b.dataset_id === request.datasetId &&
                  b.dataset_version === request.datasetVersion && b.environment_id === request.environmentId);
                if (!binding) throw new Error("This configuration has no backend resource binding. Select the published Guardrail conversation safety dataset and Isolated evaluation environment.");
                const snapshot = { ...evaluation.snapshot, environment: { ...evaluation.snapshot.environment, modelId: binding.model_id, runner: { id: "kubernetes", concurrency: 1 } }, scorers: [] };
                const run = await executionApi<RemoteRun>(projectId, "runs", {
                  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
                  body: JSON.stringify({ name: request.name, target_id: request.targetId, dataset_id: request.datasetId,
                    dataset_version: request.datasetVersion, environment_id: request.environmentId, model_id: binding.model_id,
                    scoring_mode: "mock", scorer_ids: ["mock-score"], snapshot }),
                });
                setState(s => ({ ...s, evaluations: [fromRemote(run), ...s.evaluations.filter(e => e.id !== run.id)] }));
                onClose();
                onStarted?.(run.id);
              } catch (e) {
                setError((e as Error).message);
                submitted.current = false;
              } finally { setBusy(false); }
            }}
          >
            <Play />
            {busy ? "Starting…" : "Run evaluation"}
          </Button>
      </div>
      </>}
      onClose={onClose}
    >
        <div className="space-y-6">
          <Field label="Evaluation name *">
            <Input
              value={request.name}
              placeholder="e.g. Guardrail safety regression"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dataset *">
              <Select
                value={request.datasetId}
                onChange={(e) => {
                  const d = state.datasets.find(
                    (item) => item.id === e.target.value,
                  );
                  patch({
                    datasetId: e.target.value,
                    datasetVersion: d?.versions.at(-1)?.version ?? 0,
                    scorerIds: defaultScorerIds(d?.versions.at(-1)?.scorerIds),
                  });
                }}
              >
                <option value="">Choose a published dataset</option>
                {state.datasets
                  .filter((d) => d.versions.length)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.draft.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Dataset version *">
              <Select
                value={request.datasetVersion}
                onChange={(e) =>
                  patch({
                    datasetVersion: Number(e.target.value),
                    scorerIds: defaultScorerIds(dataset?.versions.find((v) => v.version === Number(e.target.value))?.scorerIds),
                  })
                }
              >
                {dataset?.versions.toReversed().map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {v.rows.length} records
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!firstDataset && (
            <p className="text-sm text-muted-foreground">
              Publish a dataset before running an evaluation.{" "}
              <Link
                className="underline"
                to="/$projectId/evaluation/datasets"
                params={{ projectId }}
                onClick={onClose}
              >
                Open Datasets
              </Link>
            </p>
          )}
          <Field label="Execution environment *">
            <Select
              value={request.environmentId}
              onChange={(e) => patch({ environmentId: e.target.value })}
            >
              <option value="">Select environment configuration</option>
              {state.environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.versions.at(-1)!.name} · Sandbox · v
                  {e.versions.at(-1)!.version}
                </option>
              ))}
            </Select>
          </Field>
          {environment && (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="font-medium">{environment.name} · v{environment.version} · Kubernetes Job</p>
              <p className="mt-2 text-muted-foreground">{environment.description}</p>
              <p className="mt-2 text-muted-foreground">Model: {bindings.find(b => b.environment_id === request.environmentId)?.model_id ?? "Not bound"} · Target execution: LLM risk classification · Concurrency: 1</p>
            </div>
          )}
          <Field label="Scoring mode">
            <Select value="mock" disabled><option value="mock">Mock score · development</option></Select>
          </Field>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            Real model requests and Langfuse feedback. The mock-score scorer returns a fixed score of 1; this does not measure target quality.
            Configured policy and risk scorers are not installed in the backend yet.
          </p>
          <p className="text-sm text-muted-foreground">Runtime isolation uses the server-managed Kubernetes profile. OpenShell restrictions from the configuration preview are not applied.</p>
        </div>
    </Modal>
  );
}
