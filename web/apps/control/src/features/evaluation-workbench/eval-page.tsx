import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, Plus, ShieldCheck, Server, Gauge, Save, Layers } from "lucide-react";
import { useCurrentProjectId } from "@/hooks/use-project";
import type { CreateEvaluationRequest } from "./contracts";
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
  const navigate = useNavigate();
  const { state, setState } = useWorkbench();
  const projectId = useCurrentProjectId();
  const [filter, setFilter] = useState("ALL");
  const [targetType, setTargetType] = useState("GUARDRAIL");
  const [provider, setProvider] = useState("ALL");
  const [configTargetId, setConfigTargetId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [creatingTarget, setCreatingTarget] = useState(false);
  const targets = state.targets.filter((target) => target.kind === targetType && (provider === "ALL" || target.provider === provider));
  const runs = state.evaluations.filter(
    (e) => (!historyTargetId || e.snapshot.target.id === historyTargetId) &&
      (filter === "ALL" || e.status === filter),
  );
  return (
    <Frame
      title="Evaluation"
      description="Choose a target type, inspect its targets, then configure and run an evaluation."
      action={<Button onClick={()=>setCreatingTarget(true)}><Plus />New target</Button>}
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
      {creatingTarget && <NewTargetDialog onClose={()=>setCreatingTarget(false)} onCreated={()=>{
        setTargetType("GUARDRAIL"); setProvider("ALL"); setCreatingTarget(false);
      }} />}
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
  const [selectedDatasets, setSelectedDatasets] = useState<Array<{dataset_id:string;dataset_version:number}>>([]);
  const [step,setStep] = useState(0);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("published");
  const [scoringMode, setScoringMode] = useState<"mock"|"installed">("mock");
  const [revision, setRevision] = useState<string | undefined>();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!targetId) {setLoadingConfig(false);return;}
    let active=true;
    executionApi<TargetRunConfig>(projectId, `targets/${encodeURIComponent(targetId)}/config`).then(c=>{
      if(!active)return;
      setRevision(c.revision);setSource(c.data_source);setScoringMode(c.scoring_mode);
      setSelectedDatasets(c.datasets ?? [{dataset_id:c.dataset_id,dataset_version:c.dataset_version}]);
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
  const validDatasets = selectedDatasets.length > 0 && selectedDatasets.every(ref=>state.datasets.some(d=>d.id===ref.dataset_id&&d.versions.some(v=>v.version===ref.dataset_version)));
  const environment = state.environments
    .find((e) => e.id === request.environmentId)
    ?.versions.find(v=>v.version===request.environmentVersion);
  const chosenVersions=selectedDatasets.map(ref=>state.datasets.find(d=>d.id===ref.dataset_id)?.versions.find(v=>v.version===ref.dataset_version));
  const availableScorers=Object.keys((chosenVersions[0]?.metadata?.evaluation as {scorers?:Record<string,unknown>}|undefined)?.scorers??{}).filter(id=>chosenVersions.every(v=>{
    const configs=(v?.metadata?.evaluation as {scorers?:Record<string,unknown>}|undefined)?.scorers;
    return !!configs?.[id]&&(!v?.scorerIds?.length||v.scorerIds.includes(id));
  }));
  const validScorers=scoringMode==='mock'||(request.scorerIds.length>0&&request.scorerIds.every(id=>availableScorers.includes(id)));
  const stepTitles=['Datasets','Scorers','Environment'];
  return (
    <Modal
      title="Target configuration"
      description="Set up this target in three steps. You can go back to adjust your choices before saving."
      footer={<>
      <ErrorText message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Layers className="size-4"/>Step {step+1} of 3</span>
        <Button
          variant="outline"
          onClick={onClose}
        >
          Cancel
        </Button>
        {step>0&&<Button variant="outline" disabled={busy} onClick={()=>setStep(v=>v-1)}>Back</Button>}
        {step<2?<Button disabled={busy||loadingConfig||!validDatasets||(step===1&&!validScorers)} onClick={()=>setStep(v=>v+1)}>Continue to {stepTitles[step+1].toLowerCase()}<ArrowRight/></Button>:<Button
            disabled={busy || loadingConfig || !validDatasets || !validScorers || !environment}
            onClick={async () => {
              if (submitted.current) return;
              submitted.current = true;
              setBusy(true);
              try {
                const saved=await executionApi<TargetRunConfig>(projectId, `targets/${encodeURIComponent(request.targetId)}/config`, {
                  method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({revision,dataset_id:selectedDatasets[0]!.dataset_id,dataset_version:selectedDatasets[0]!.dataset_version,datasets:selectedDatasets,
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
            <Save />
            {busy ? "Saving…" : "Save config"}
          </Button>}
      </div>
      </>}
      onClose={onClose}
    >
        <div className="space-y-6">
          <nav aria-label="Configuration progress"><ol className="grid grid-cols-3 gap-2">{stepTitles.map((title,index)=><li key={title} className={`border-b-2 pb-3 ${index<=step?'border-primary':'border-muted'}`}><button type="button" disabled={busy||index>step} onClick={()=>setStep(index)} aria-current={index===step?'step':undefined} className={`flex items-center gap-2 text-sm ${index===step?'font-medium text-primary':'text-muted-foreground'}`}><span className={`flex size-6 items-center justify-center rounded-full text-xs ${index<=step?'bg-primary text-primary-foreground':'bg-muted'}`}>{index<step?'✓':index+1}</span>{title}</button></li>)}</ol></nav>
          <div><h2 className="text-lg font-medium">{['Choose your evaluation datasets','Choose how to score results','Choose where to run'][step]}</h2><p className="mt-1 text-sm text-muted-foreground">{['Select the datasets and versions available when you trigger this target.','Apply the same scorers to every selected dataset.','Select an environment, then save your target configuration.'][step]}</p></div>
          {step===0&&<div className="min-w-0 space-y-4">
            <ConfigDatasetPicker datasets={state.datasets} selected={selectedDatasets} onChange={setSelectedDatasets} disabled={busy||loadingConfig}/>
            {!firstDataset&&<Link className="text-sm text-primary underline" to="/$projectId/evaluation/datasets" params={{projectId}} onClick={onClose}>Publish a dataset to get started</Link>}
            <fieldset disabled={busy||loadingConfig} className="rounded-xl border bg-background p-5">
              <legend className="sr-only">Data source</legend>
              <h3 className="mb-1 text-sm font-medium">Sample source</h3>
              <p className="mb-4 text-xs text-muted-foreground">Choose where each run gets its samples.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([{value:'published',title:'Published dataset',detail:'Use the records in each selected version.'},{value:'upload',title:'Upload at trigger',detail:'Upload a CSV or XLSX for each selected dataset.'}]).map(item=><label key={item.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${source===item.value?'border-primary/50 bg-primary/5':'hover:bg-muted/30'}`}>
                  <input type="radio" name="config-data-source" value={item.value} checked={source===item.value} onChange={()=>setSource(item.value)} className="mt-0.5 accent-primary"/>
                  <span><span className="block text-xs font-medium">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span></span>
                </label>)}
              </div>
            </fieldset>
          </div>}
          {step===1&&<section aria-label="Scoring settings" className="space-y-4">
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-5 ${scoringMode==='mock'?'border-primary/50 bg-primary/5':''}`}><input type="radio" name="scorer-mode" checked={scoringMode==='mock'} onChange={()=>setScoringMode('mock')} className="mt-1 accent-primary"/><span><span className="flex items-center gap-2 font-medium">Mock score<Pill>Development</Pill></span><span className="mt-2 block text-sm text-muted-foreground">Returns a fixed score of 1 to validate the workflow. This does not measure target quality.</span></span></label>
            <div className={`space-y-4 rounded-xl border p-5 ${scoringMode==='installed'?'border-primary/50 bg-primary/5':''}`}>
              <label className="flex cursor-pointer items-center gap-3 font-medium"><input type="radio" name="scorer-mode" checked={scoringMode==='installed'} disabled={!availableScorers.length} onChange={()=>{setScoringMode('installed');patch({scorerIds:availableScorers});}} className="accent-primary"/>Dataset scorers</label>
              <p className="text-sm text-muted-foreground">{availableScorers.length?'Versioned scorers shared by all selected datasets. The backend validates the installed library when saving.':'No shared versioned scorers are configured for these datasets. Add scorer metadata to the dataset versions to enable this option.'}</p>
              {scoringMode==='installed'&&availableScorers.map(id=><label key={id} className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm"><input type="checkbox" checked={request.scorerIds.includes(id)} onChange={e=>patch({scorerIds:e.target.checked?[...request.scorerIds,id]:request.scorerIds.filter(s=>s!==id)})} className="accent-primary"/>{state.scorers.find(s=>s.id===id)?.draft.name??id}</label>)}
            </div>
          </section>}
          {step===2&&<div className="space-y-4">
            <section aria-label="Execution settings" className="space-y-4 rounded-xl border bg-background p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Execution environment *"><Select disabled={busy||loadingConfig} value={request.environmentId} onChange={e=>patch({environmentId:e.target.value,environmentVersion:state.environments.find(v=>v.id===e.target.value)?.versions.at(-1)?.version??0})}>
                <option value="">Select an environment</option>
                {state.environments.map(e=><option key={e.id} value={e.id}>{e.versions.at(-1)!.name}</option>)}
              </Select></Field>
              <Field label="Environment version *"><Select disabled={busy||loadingConfig} value={request.environmentVersion} onChange={e=>patch({environmentVersion:Number(e.target.value)})}>
                {state.environments.find(e=>e.id===request.environmentId)?.versions.toReversed().map(v=><option key={v.version} value={v.version}>v{v.version} · {v.cpuMillicores}m / {v.memoryMiB}Mi</option>)}
              </Select></Field>
              </div>
              {environment&&<section aria-label="Selected environment details" className="overflow-hidden rounded-lg border bg-muted/10">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Server className="size-4"/>Selected environment details</div>
                  <Pill>v{environment.version}</Pill>
                </div>
                <div className="space-y-4 p-4">
                  <div><h3 className="text-base font-medium">{environment.name}</h3>{environment.description&&<p className="mt-1 text-xs leading-5 text-muted-foreground">{environment.description}</p>}</div>
                  <dl className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="mt-1 break-all text-sm font-medium">{environment.modelId==='none'?'No model':environment.modelId}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">CPU</dt><dd className="mt-1 text-sm font-medium">{environment.cpuMillicores}m</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Memory</dt><dd className="mt-1 text-sm font-medium">{environment.memoryMiB} MiB</dd></div>
                  </dl>
                  <p className="rounded-md bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">{environment.modelId==='none'?'Execution flow: dataset input → scorers. No model call is made.':'Execution flow: dataset input → configured model → scorers.'}</p>
                </div>
              </section>}

            </section>
            <div className="rounded-xl border bg-muted/20 p-4 text-sm"><p className="font-medium">Ready to save</p><p className="mt-2 text-muted-foreground">{selectedDatasets.length} datasets · {scoringMode==='mock'?'Mock score':request.scorerIds.join(', ')} · {source==='upload'?'Upload at trigger':'Published samples'}</p><p className="mt-2 text-xs text-muted-foreground">Saving config makes these choices available in Trigger. It does not start an evaluation.</p></div>
          </div>}
        </div>
    </Modal>
  );
}
