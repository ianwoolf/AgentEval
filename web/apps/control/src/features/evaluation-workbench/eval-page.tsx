import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, Plus, ShieldCheck, FileText } from "lucide-react";
import { useCurrentProjectId } from "@/hooks/use-project";
import type { CreateEvaluationRequest } from "./contracts";
import { createEvaluation } from "./domain";
import { useWorkbench } from "./provider";
import {
  Button,
  Empty,
  ErrorText,
  Field,
  Frame,
  Input,
  Metric,
  Modal,
  Pill,
  Select,
  Table,
} from "./ui";
export function EvalPage() {
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const runs = state.evaluations.filter(
    (e) => filter === "ALL" || e.status === filter,
  );
  return (
    <Frame
      title="Eval"
      description="Bring your target, dataset, sandbox and scorers together in a repeatable evaluation."
      action={
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New evaluation
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Evaluations"
          value={state.evaluations.length}
          detail="Current demo session"
        />
        <Metric
          label="In progress"
          value={state.evaluations.filter((e) => e.status === "RUNNING").length}
          detail="Simulated execution"
        />
        <Metric
          label="Available datasets"
          value={state.datasets.filter((d) => d.versions.length).length}
          detail="With published versions"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl">Evaluation history</h2>
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
                      value={run.results.length}
                      max={run.snapshot.dataset.rows.length}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.results.length}/{run.snapshot.dataset.rows.length}{" "}
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
                  {run.status === "RUNNING" ? (
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
          No evaluations match this status. Create an evaluation to get started.
        </Empty>
      )}
      {creating && <CreateEvalDialog onClose={() => setCreating(false)} />}
    </Frame>
  );
}
export function CreateEvalDialog({ onClose }: { onClose(): void }) {
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const firstDataset = state.datasets.find((d) => d.versions.length);
  const [request, setRequest] = useState<CreateEvaluationRequest>({
    name: "",
    targetId: state.targets[0]?.id ?? "",
    datasetId: firstDataset?.id ?? "",
    datasetVersion: firstDataset?.versions.at(-1)?.version ?? 0,
    environmentId: state.environments[0]?.id ?? "",
    scorerIds: [],
  });
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState("ALL");
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const patch = (value: Partial<CreateEvaluationRequest>) => {
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
  const target = state.targets.find((t) => t.id === request.targetId);
  const check = () => {
    try {
      createEvaluation(state, request);
      setStep(1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={step === 0 ? "New evaluation" : "Review evaluation"}
      description={
        step === 0
          ? "Choose the resources to test together. Only published dataset and scorer versions can run."
          : "These versions will be captured in the report. All execution and results are simulated."
      }
      onClose={onClose}
    >
      <div className="flex items-center gap-3 text-sm">
        <Pill tone={step === 0 ? "good" : "neutral"}>1 · Configure</Pill>
        <ArrowRight className="size-4 text-muted-foreground" />
        <Pill tone={step === 1 ? "good" : "neutral"}>2 · Review & run</Pill>
      </div>
      {step === 0 ? (
        <div className="space-y-6">
          <Field label="Evaluation name *">
            <Input
              value={request.name}
              placeholder="e.g. Support prompt regression"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target type">
              <Select
                value={kind}
                onChange={(e) => {
                  const k = e.target.value;
                  setKind(k);
                  patch({
                    targetId:
                      state.targets.find((t) => k === "ALL" || t.kind === k)
                        ?.id ?? "",
                  });
                }}
              >
                <option value="ALL">Prompt & Guardrail</option>
                <option value="PROMPT">Prompt</option>
                <option value="GUARDRAIL">Guardrail</option>
              </Select>
            </Field>
            <Field label="Test target *">
              <Select
                value={request.targetId}
                onChange={(e) => patch({ targetId: e.target.value })}
              >
                {state.targets
                  .filter((t) => kind === "ALL" || t.kind === kind)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · v{t.version}
                    </option>
                  ))}
              </Select>
            </Field>
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
                  patch({ datasetVersion: Number(e.target.value) })
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
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">
              Scorers *{" "}
              <span className="font-normal text-muted-foreground">
                Select one or more
              </span>
            </legend>
            {state.scorers
              .filter((s) => s.enabled && s.versions.length)
              .map((s) => {
                const v = s.versions.at(-1)!;
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${request.scorerIds.includes(s.id) ? "border-primary/40 bg-primary/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={request.scorerIds.includes(s.id)}
                      onChange={(e) =>
                        patch({
                          scorerIds: e.target.checked
                            ? [...request.scorerIds, s.id]
                            : request.scorerIds.filter((id) => id !== s.id),
                        })
                      }
                    />
                    <span className="flex-1">
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        v{v.version} · threshold {v.threshold}
                      </span>
                    </span>
                    <Pill>
                      {s.source === "BUILT_IN" ? "Built-in" : "Custom"}
                    </Pill>
                  </label>
                );
              })}
          </fieldset>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="font-heading text-xl">{request.name}</h3>
          <div className="grid gap-4 rounded-lg border bg-muted/20 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Target</p>
              <p className="mt-2 flex items-center gap-2 font-medium">
                {target?.kind === "GUARDRAIL" ? (
                  <ShieldCheck className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
                {target?.name} · v{target?.version}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dataset</p>
              <p className="mt-2 font-medium">
                {version?.name} · v{version?.version}
              </p>
              <p className="text-xs text-muted-foreground">
                {version?.rows.length} samples
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Environment</p>
              <p className="mt-2 font-medium">
                {environment?.name} · v{environment?.version}
              </p>
              <p className="text-xs text-muted-foreground">
                LLM + Guardrail proxy · simulated
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scorers</p>
              {request.scorerIds.map((id) => {
                const s = state.scorers
                  .find((item) => item.id === id)!
                  .versions.at(-1)!;
                return (
                  <p key={id} className="mt-2 font-medium">
                    {s.name} · v{s.version}
                  </p>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            No external service will be called. Results appear incrementally
            using deterministic demo data.
          </p>
        </div>
      )}
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => (step ? setStep(0) : onClose())}
        >
          {step ? "Back" : "Cancel"}
        </Button>
        {step === 0 ? (
          <Button onClick={check}>
            Review evaluation
            <ArrowRight />
          </Button>
        ) : (
          <Button
            onClick={() => {
              if (submitted.current) return;
              try {
                const evaluation = createEvaluation(state, request);
                submitted.current = true;
                setState((s) => ({
                  ...s,
                  evaluations: [evaluation, ...s.evaluations],
                }));
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Play />
            Run simulation
          </Button>
        )}
      </div>
    </Modal>
  );
}
