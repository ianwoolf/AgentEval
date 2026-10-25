import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { useCurrentProjectId } from "@/hooks/use-project";
import type { CreateEvaluationRequest } from "./contracts";
import { executionApi, fromRemote, type Binding, type RemoteRun, type TargetRunConfig } from "./remote";

import { TriggerTargetDialog } from "./trigger-target";
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
  const [provider, setProvider] = useState("ALL");
  const [configTargetId, setConfigTargetId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const targets = state.targets.filter((target) => target.kind === targetType && (provider === "ALL" || target.provider === provider));
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
        <Field label="Provider">
          <Select value={provider} onChange={e=>setProvider(e.target.value)}>
            <option value="ALL">All providers</option>
            <option value="f5">F5</option>
            <option value="nemo guardrail">NeMo Guardrail</option>
          </Select>
        </Field>
        <p className="text-sm text-muted-foreground">{targets.length} target{targets.length === 1 ? "" : "s"}</p>
      </div>
      <Table>
        <thead><tr><th>Target</th><th>Type</th><th>Provider</th><th>Version</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>
          {targets.map((target) => (
            <tr key={target.id}>
              <td><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><p className="font-medium">{target.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{target.id}</p></div></div></td>
              <td><Pill>Guardrail</Pill></td>
              <td>{target.provider === "f5" ? "F5" : target.provider === "nemo guardrail" ? "NeMo Guardrail" : "—"}</td>
              <td>v{target.version}</td>
              <td className="max-w-md text-muted-foreground">{target.definition}</td>
              <td><div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setHistoryTargetId(target.id);
                  setFilter("ALL");
                }}>History</Button>
                <Button variant="outline" onClick={() => setConfigTargetId(target.id)}>Config</Button>
                <Button onClick={() => setSelectedTargetId(target.id)}><Play />Trigger</Button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!targets.length && <Empty>No targets available for this type.</Empty>}
      {configTargetId && <CreateEvalDialog targetId={configTargetId} onClose={()=>setConfigTargetId(null)} />}
      {selectedTargetId && <TriggerTargetDialog key={selectedTargetId} targetId={selectedTargetId}
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
                      max={run.remote?.sample_count ?? run.snapshot.dataset.rows.length}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.remote?.completed ?? run.results.length}/{run.remote?.sample_count ?? run.snapshot.dataset.rows.length}{" "}
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
  const [request, setRequest] = useState<CreateEvaluationRequest & {environmentVersion:number}>({
    name: "",
    targetId: targetId ?? state.targets.find((t) => t.kind === "GUARDRAIL")?.id ?? "",
    datasetId: firstDataset?.id ?? "",
    datasetVersion: firstDataset?.versions.at(-1)?.version ?? 0,
    environmentId: state.environments[0]?.id ?? "",
    environmentVersion: state.environments[0]?.versions.at(-1)?.version ?? 0,
    scorerIds: defaultScorerIds(firstDataset?.versions.at(-1)?.scorerIds),
  });
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("published");
  const [scoringMode, setScoringMode] = useState<"mock"|"installed">("mock");
  const [revision, setRevision] = useState<string | undefined>();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    executionApi<{bindings: Binding[]}>(projectId, "config")
      .then(config => { if (active) setBindings(config.bindings); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    if (!targetId) {setLoadingConfig(false);return;}
    let active=true;
    executionApi<TargetRunConfig>(projectId, `targets/${encodeURIComponent(targetId)}/config`).then(c=>{
      if(!active)return;
      setRevision(c.revision);setSource(c.data_source);setScoringMode(c.scoring_mode);
      setRequest(r=>({...r,datasetId:c.dataset_id,datasetVersion:c.dataset_version,environmentId:c.environment_id,environmentVersion:c.environment_version,scorerIds:c.scorer_ids}));
    }).catch(e=>{if(active && e.status!==404)setError(e.message);}).finally(()=>{if(active)setLoadingConfig(false);});
    return()=>{active=false;};
  },[projectId,targetId]);
  useEffect(() => {
    if (!request.datasetId && firstDataset) setRequest(r => ({...r, datasetId: firstDataset.id, datasetVersion: firstDataset.versions.at(-1)!.version, scorerIds: defaultScorerIds(firstDataset.versions.at(-1)!.scorerIds)}));
  }, [firstDataset, request.datasetId]);
  useEffect(() => {
    setRequest(r => r.targetId && r.environmentId ? r : ({...r,
      targetId:r.targetId || targetId || state.targets.find(t=>t.kind==="GUARDRAIL")?.id || "",
      environmentId:r.environmentId || state.environments[0]?.id || "",
      environmentVersion:r.environmentVersion || state.environments[0]?.versions.at(-1)?.version || 0}));
  }, [state.targets, state.environments, targetId]);
  const patch = (value: Partial<CreateEvaluationRequest & {environmentVersion:number}>) => {
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
    ?.versions.find(v=>v.version===request.environmentVersion);
  return (
    <Modal
      title="Target configuration"
      description="Save the dataset, environment version and scoring settings used by future runs of this target."
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
            disabled={busy || loadingConfig || !bindings.length}
            onClick={async () => {
              if (submitted.current) return;
              submitted.current = true;
              setBusy(true);
              try {
                const saved=await executionApi<TargetRunConfig>(projectId, `targets/${encodeURIComponent(request.targetId)}/config`, {
                  method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({revision,dataset_id:request.datasetId,dataset_version:request.datasetVersion,
                    environment_id:request.environmentId,environment_version:request.environmentVersion,
                    data_source:source,scoring_mode:scoringMode,scorer_ids:scoringMode==="mock"?["mock-score"]:request.scorerIds}),
                });
                setRevision(saved.revision);
                onClose();

              } catch (e) {
                setError((e as Error).message);
                submitted.current = false;
              } finally { setBusy(false); }
            }}
          >
            <Play />
            {busy ? "Saving…" : "Save config"}
          </Button>
      </div>
      </>}
      onClose={onClose}
    >
        <div className="space-y-6">
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
          <Field label="Data source"><Select value={source} disabled={busy} onChange={e=>{setSource(e.target.value);idempotencyKey.current=crypto.randomUUID();}}>
            <option value="published">Published dataset</option><option value="upload">Upload for this evaluation</option>
          </Select></Field>
          {source === "upload" && <p className="text-sm text-muted-foreground">Each Trigger requires a fresh CSV/XLSX upload validated against this dataset version. Files are not saved in Config.</p>}
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
              onChange={(e) => patch({ environmentId: e.target.value, environmentVersion: state.environments.find(v=>v.id===e.target.value)?.versions.at(-1)?.version ?? 0 })}
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
          <Field label="Environment version *"><Select value={request.environmentVersion} onChange={e=>patch({environmentVersion:Number(e.target.value)})}>
            {state.environments.find(e=>e.id===request.environmentId)?.versions.toReversed().map(v=><option key={v.version} value={v.version}>v{v.version} · {v.cpuMillicores}m / {v.memoryMiB}Mi</option>)}
          </Select></Field>
          {environment && (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="font-medium">{environment.name} · v{environment.version} · Kubernetes Job</p>
              <p className="mt-2 text-muted-foreground">{environment.description}</p>
              <p className="mt-2">CPU: {environment.cpuMillicores}m · Memory: {environment.memoryMiB}Mi (requests = limits)</p>
              <p className="text-xs text-muted-foreground">1000m = 1 CPU core · 1024Mi = 1Gi</p>
              <p className="mt-2 text-muted-foreground">Model: {environment.modelId} · Target execution: {environment.modelId === "none" ? "Dataset input → scorers (no model)" : "LLM risk classification"} · Concurrency: 1</p>
            </div>
          )}
          <Field label="Scoring mode">
            <Select value={scoringMode} disabled><option value="mock">Mock score · development</option><option value="installed">Installed scorers</option></Select>
          </Field>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            Real model requests and persisted sample results. The mock-score scorer returns a fixed score of 1; this does not measure target quality.
            Configured policy and risk scorers are not installed in the backend yet.
          </p>
          <p className="text-sm text-muted-foreground">Runtime isolation uses the server-managed Kubernetes profile. OpenShell restrictions from the configuration preview are not applied.</p>
        </div>
    </Modal>
  );
}
