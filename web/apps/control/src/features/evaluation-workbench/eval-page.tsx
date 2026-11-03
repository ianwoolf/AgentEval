import {EvaluationConfigurator} from "./evaluation-configurator";
import {DeleteResource} from "./delete-resource";
import {useAdminView} from './view-mode';
import {aspectLabels,criteriaPresets,readCriteria} from "./criteria";
import {datasetScoring,datasetCoverage} from './dataset-scoring';
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, Plus, ShieldCheck, Server, Gauge, Save, Layers } from "lucide-react";
import { useCurrentProjectId } from "@/hooks/use-project";
import type { Target, CreateEvaluationRequest } from "./contracts";
import { executionApi, fromRemote, type RemoteRun, type TargetRunConfig } from "./remote";

import { ConfigDatasetPicker } from "./config-dataset-picker";
import { TriggerTargetDialog } from "./trigger-target";
import { NewTargetDialog } from "./new-target-dialog";
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
  const admin=useAdminView();
  const navigate = useNavigate();
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const [filter, setFilter] = useState("ALL");
  const [targetType, setTargetType] = useState("GUARDRAIL");
  const [provider, setProvider] = useState("ALL");
  const [configTargetId, setConfigTargetId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [creatingTarget, setCreatingTarget] = useState(false);
  const targets = state.targets.filter((target) => target.kind === targetType && (provider === "ALL" || target.provider === provider));
  const runs = state.evaluations.filter(
    (e) => (!historyTargetId || e.snapshot.target.id === historyTargetId) &&
      (filter === "ALL" || e.status === filter),
  );
  return (
    <Frame
      title="Evaluation"
      description="Choose a target, run an evaluation, then review its results."
      action={admin&&<Button onClick={()=>setCreatingTarget(true)}><Plus />New evaluation</Button>}
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
        <thead><tr><th>Evaluation</th><th>Type</th><th>Provider</th><th>Version</th><th>Configuration</th><th>Actions</th></tr></thead>
        <tbody>
          {targets.map((target) => (
            <tr key={target.id}>
              <td><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><p className="font-medium">{target.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{target.id}</p><p className="mt-1 text-xs text-muted-foreground">Target ID: {target.guardrail_id ?? target.id}</p></div></div></td>
              <td><Pill>Guardrail</Pill></td>
              <td>{target.provider === "f5" ? "F5" : target.provider === "nemo guardrail" ? "NeMo Guardrail" : "—"}</td>
              <td>v{target.version}</td>
              <td className="max-w-md text-xs text-muted-foreground">{target.evaluation_config ? `${target.evaluation_config.datasets?.length ?? 1} datasets · ${target.evaluation_config.environment_id} v${target.evaluation_config.environment_version}` : "Configure datasets, scorers and environment"}</td>
              <td><div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setHistoryTargetId(target.id);
                  setFilter("ALL");
                }}>History</Button>
                {admin&&<Button variant="outline" onClick={() => setEditingTarget(target)}>Configure</Button>}
                <Button onClick={() => setSelectedTargetId(target.id)}><Play />Trigger</Button>
                {admin&&<DeleteResource collection="targets" id={target.id} name={target.name}/>}
              </div></td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!targets.length && <Empty>No targets available for this type.</Empty>}
      {(editingTarget || creatingTarget) && <EvaluationConfigurator initial={editingTarget ?? undefined} onClose={()=>{setEditingTarget(null);setCreatingTarget(false);}} onSaved={(id)=>{setEditingTarget(null);setCreatingTarget(false);if(id)setSelectedTargetId(id);}} />}
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
export function CreateEvalDialog({onClose,targetId,onStarted}:{onClose():void;targetId?:string;onStarted?(id:string):void}) {
 const {state}=useWorkbench();
 return <EvaluationConfigurator initial={state.targets.find(t=>t.id===targetId)} onClose={onClose} onSaved={id=>{onClose();if(id)onStarted?.(id);}}/>;
}
