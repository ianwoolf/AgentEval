import {TraceViewer} from './trace-viewer';
import {aspectLabels} from "./criteria";
import {GuardrailReport, type BindingResult} from './guardrail-report';
import {scoreText, type GuardrailSummary} from './guardrail-score-dashboard';
import { ReportConfig } from "./report-config";
import { useEffect, useState, type ReactNode } from "react";
import { useCurrentProjectId } from "@/hooks/use-project";
import { executionApi, executionPages } from "./remote";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Evaluation, SampleResult } from "./contracts";
import { useWorkbench } from "./provider";
import {
  Button,
  Empty,
  Field,
  Frame,
  Input,
  JsonPreview,
  Metric,
  Modal,
  Pill,
  Select,
  Table,
  Tabs,
  download,
  textValue,
} from "./ui";

function compareRunOrder(a: Evaluation, b: Evaluation) {
  return (a.remote?.group_index ?? a.remote?.serial_index ?? a.remote?.concurrency ?? 0) -
    (b.remote?.group_index ?? b.remote?.serial_index ?? b.remote?.concurrency ?? 0);
}

export function ReportsPage({
  evaluationId,
  onSelect,
}: {
  evaluationId: string;
  onSelect(id: string): void;
}) {
  const { state } = useWorkbench();
  const [idQuery, setIdQuery] = useState("");
  const [targetId, setTargetId] = useState("ALL");
  const [comparison, setComparison] = useState<{source:string;reference:string}>();
  const run = state.evaluations.find((e) => e.id === evaluationId);
  const groupId = run?.remote?.concurrency_group ?? evaluationId;
  const group = groupId ? state.evaluations.filter(e => e.remote?.concurrency_group === groupId).sort(compareRunOrder) : [];
  const applyComparison = (source: Evaluation, reference: Evaluation) => {
    setComparison({source:source.id,reference:reference.remote!.experiment_id});
    onSelect(source.id);
  };
  if (!run && group.length) {
    const first = group[0];
    const finished = group.filter(member => member.status !== 'RUNNING').length;
    return <Frame title={first.snapshot.target.name} description={`Evaluation group · ${new Date(first.createdAt).toLocaleString()} · ${finished}/${group.length} runs finished`}
      action={<CompareRuns sources={group} current={first} catalog={state.evaluations} onApply={applyComparison}/>}>
      <Button variant="ghost" onClick={()=>onSelect("")}><ArrowLeft/>All reports</Button>
      <RunSummary runs={group} onSelect={id=>{setComparison(undefined);onSelect(id);}}/>
    </Frame>;
  }
  if (evaluationId && run?.remote) {
    return <LiveReport key={run.id} run={run} onBack={() => onSelect(run.remote?.concurrency_group ?? "")}
      comparedReport={comparison?.source === run.id ? comparison.reference : ""}
      compareControl={<CompareRuns sources={group.length ? group : [run]} current={run} catalog={state.evaluations}
        active={comparison?.source === run.id} onClear={()=>setComparison(undefined)} onApply={applyComparison}/>}/>;
  }
  if (evaluationId)
    return run ? (
      <ReportDetail key={run.id} run={run} onBack={() => onSelect("")} />
    ) : (
      <Frame
        title="Report unavailable"
        description="Loading evaluation or report unavailable."
      >
        <Empty>
          Live reports are loaded from the backend; check its connection if this message persists.{" "}
          <Button variant="link" onClick={() => onSelect("")}>
            View available reports
          </Button>
        </Empty>
      </Frame>
    );
  const groups = new Map<string, Evaluation[]>();
  for (const evaluation of state.evaluations) {
    if (targetId !== "ALL" && evaluation.snapshot.target.id !== targetId) continue;
    const groupId = evaluation.remote?.concurrency_group;
    const key = groupId ? `group:${groupId}` : `run:${evaluation.id}`;
    const members = groups.get(key);
    if (members) members.push(evaluation);
    else groups.set(key, [evaluation]);
  }
  const query = idQuery.trim();
  const reports = Array.from(groups.values()).filter(members =>
    !query || members[0].remote?.concurrency_group === query || members.some(member => member.id === query),
  );
  return (
    <Frame
      title="Reports"
      description="Find an evaluation, inspect individual samples and trace every score back to its configuration."
    >
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <Field
          label="Evaluation ID"
          hint="Exact match by run ID or comparison group ID."
        >
          <Input
            value={idQuery}
            placeholder="e.g. eval-demo-001"
            onChange={(e) => setIdQuery(e.target.value)}
          />
        </Field>
        <Field label="Test target">
          <Select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="ALL">All targets</option>
            {state.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.kind}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {reports.length ? (
        <Table>
          <thead>
            <tr>
              <th>Evaluation</th>
              <th>Target</th>
              <th>Status</th>
              <th>Samples</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((members) => {
              const ordered = members.sort(compareRunOrder);
              const e = ordered[0];
              const groupId = e.remote?.concurrency_group;
              const openId = ordered.find(member => member.id === query)?.id ?? groupId ?? e.id;
              const finished = ordered.filter(member => member.status !== "RUNNING").length;
              let status: Evaluation["status"] | "QUEUED" = e.status;
              if (groupId) {
                if (ordered.every(member => member.status === "RUNNING" && member.remote?.phase === "QUEUED")) status = "QUEUED";
                else if (finished < ordered.length) status = "RUNNING";
                else if (ordered.some(member => member.status === "FAILED")) status = "FAILED";
                else if (ordered.some(member => member.status === "CANCELLED")) status = "CANCELLED";
                else status = "COMPLETED";
              }
              const completed = ordered.reduce((sum, member) => sum + (member.remote?.completed ?? member.results.length), 0);
              const total = ordered.reduce((sum, member) => sum + (member.remote?.sample_count ?? member.snapshot.dataset.rows.length), 0);
              const rowId = groupId ?? e.id;
              return <tr key={rowId}>
                <td>
                  <button
                    className="flex items-center gap-2 text-left font-medium hover:underline"
                    onClick={() => onSelect(openId)}
                  >
                    <FileText className="size-4 text-primary" />
                    {e.name}
                  </button>
                  {groupId && <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Pill>Concurrency group</Pill>
                    <span>{ordered.length} runs · {ordered.map(member => member.remote?.concurrency ?? "—").join(
                      ordered.every(member => member.remote?.serial_index !== undefined) ? " → " : ", ",
                    )}</span>
                  </p>}
                  <p
                    className="mt-1 max-w-64 truncate font-mono text-xs text-muted-foreground"
                    title={rowId}
                  >
                    {rowId}
                  </p>
                </td>
                <td>
                  {e.snapshot.target.name}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.snapshot.target.kind} · v{e.snapshot.target.version}
                  </p>
                </td>
                <td>
                  <Pill tone={status === "COMPLETED" ? "good" : "neutral"}>
                    {status}
                  </Pill>
                  {groupId && <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{finished}/{ordered.length} runs finished</p>}
                </td>
                <td>
                  {completed}/{total}
                </td>
                <td className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td>
                  <Button variant="ghost" onClick={() => onSelect(openId)}>
                    {groupId ? "Inspect group" : "Inspect"}
                    <ArrowRight />
                  </Button>
                </td>
              </tr>;
            })}
          </tbody>
        </Table>
      ) : (
        <Empty>
          No reports match these filters.{" "}
          <Button
            variant="link"
            onClick={() => {
              setIdQuery("");
              setTargetId("ALL");
            }}
          >
            Clear filters
          </Button>
        </Empty>
      )}
    </Frame>
  );
}
export function ReportDetail({
  run,
  onBack,
}: {
  run: Evaluation;
  onBack(): void;
}) {
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [status, setStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [full, setFull] = useState(false);
  const passed = run.results.filter((r) => r.status === "PASS").length;
  const isGuardrail =
    run.snapshot.target.kind === "GUARDRAIL" &&
    run.snapshot.dataset.fields.some(
      (f) => f.name === "has_issue" && f.role === "reference",
    );
  const falsePositives = run.results.filter(
    (r) => r.reference.has_issue === false && r.output.has_issue === true,
  ).length;
  const falseNegatives = run.results.filter(
    (r) => r.reference.has_issue === true && r.output.has_issue === false,
  ).length;

  const rows = run.results.filter(
    (r) =>
      (status === "ALL" || r.status === status) &&
      JSON.stringify([r.input, r.output, r.reference])
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const averageLatency = run.results.length
    ? Math.round(
        run.results.reduce((sum, r) => sum + r.latencyMs, 0) /
          run.results.length,
      )
    : 0;
  return (
    <Frame
      title={run.name}
      description={`${run.snapshot.target.name} · ${run.snapshot.target.kind} v${run.snapshot.target.version}`}
      action={
        <Button
          variant="outline"
          onClick={() =>
            download(`${run.id}.json`, { simulated: true, ...run })
          }
        >
          <Download />
          Export report
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          All reports
        </Button>
        <Pill tone={run.status === "COMPLETED" ? "good" : "neutral"}>
          {run.status}
        </Pill>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
        <span>
          Evaluation ID:{" "}
          <code className="select-all text-foreground">{run.id}</code>
        </span>
        <span>{new Date(run.createdAt).toLocaleString()}</span>
      </div>
      <div role="status" aria-live="polite" className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="font-medium">
            {run.status === "RUNNING" ? "Evaluation in progress" : run.status === "CANCELLED" ? "Evaluation cancelled · partial report" : "Evaluation completed"}
          </p>
          <span>{run.results.length} / {run.snapshot.dataset.rows.length} samples completed</span>
        </div>
        <progress aria-label="Evaluation progress" className="h-2 w-full accent-primary" value={run.results.length} max={run.snapshot.dataset.rows.length} />
        <p className="text-sm text-muted-foreground">
          {run.status === "RUNNING"
            ? "Results update automatically as samples finish. Metrics are provisional until the evaluation completes."
            : run.status === "CANCELLED" ? "Metrics include only the samples completed before cancellation." : "All sample results are available."}
        </p>
      </div>
      <ReportConfig snapshot={run.snapshot} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pass rate"
          value={
            run.results.length
              ? `${Math.round((passed / run.results.length) * 100)}%`
              : "—"
          }
          detail={`${passed} passed · ${run.results.length - passed} with findings${run.status === "RUNNING" ? " · provisional" : ""}`}
        />
        <Metric
          label="Samples scored"
          value={`${run.results.length} / ${run.snapshot.dataset.rows.length}`}
          detail={
            run.status === "CANCELLED"
              ? "Cancelled · partial results"
              : run.status === "RUNNING" ? "In progress · live results" : "All selected scorers per sample"
          }
        />
        <Metric
          label="Average latency"
          value={`${averageLatency} ms`}
          detail="Simulated timing"
        />
        <Metric
          label="Total cost"
          value={`$${run.results.reduce((sum, r) => sum + r.costUsd, 0).toFixed(4)}`}
          detail="Simulated cost · no billing"
        />
      </div>
      {isGuardrail && (
        <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/20 p-4 text-sm">
          <span>
            Ground truth: <strong>has_issue=true</strong> means risk present.
          </span>
          <span>
            False positives: <strong>{falsePositives}</strong>
          </span>
          <span>
            False negatives: <strong>{falseNegatives}</strong>
          </span>
        </div>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            aria-label="Search sample content"
            placeholder="Search input, output or reference…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            aria-label="Sample status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All samples</option>
            <option value="PASS">Passed</option>
            <option value="FAIL">Failed</option>
            <option value="ERROR">Errors</option>
          </Select>
          <Button variant="outline" onClick={() => setFull((v) => !v)}>
            {full ? "Compact view" : "Full content"}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {rows.length} samples · select a sample to inspect its trace
          </span>
        </div>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <th>Sample</th>
                <th>{isGuardrail ? "Conversation (messages)" : "Input"}</th>
                <th>{isGuardrail ? "Detected has_issue" : "Output"}</th>
                <th>{isGuardrail ? "Expected has_issue" : "Reference"}</th>
                {run.snapshot.scorers.map((s) => (
                  <th key={s.id}>
                    {s.name}
                    <p className="font-normal">
                      v{s.version} · ≥ {s.threshold}
                    </p>
                  </th>
                ))}
                <th>Latency</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/25">
                  <td>
                    <button
                      className="flex items-center gap-2 font-medium text-primary hover:underline"
                      onClick={() => setSample(r)}
                    >
                      #{run.results.indexOf(r) + 1}
                      <ChevronRight className="size-3" />
                    </button>
                    <div className="mt-2">
                      <Pill tone={r.status === "PASS" ? "good" : "bad"}>
                        {r.status}
                      </Pill>
                    </div>
                  </td>
                  {[r.input, r.output, r.reference].map((content, index) => (
                    <td key={index} className="max-w-64 min-w-40 align-top">
                      <div
                        className={
                          full
                            ? "break-words whitespace-pre-wrap"
                            : "line-clamp-3 break-words"
                        }
                      >
                        {isGuardrail && index > 0 ? (
                          <>
                            <Pill
                              tone={content.has_issue === true ? "bad" : "good"}
                            >
                              {String(content.has_issue)} ·{" "}
                              {content.has_issue ? "Risk" : "Safe"}
                            </Pill>
                            {index === 1 && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {r.output.has_issue === r.reference.has_issue
                                  ? "Correct detection"
                                  : r.reference.has_issue
                                    ? "False negative · missed risk"
                                    : "False positive · false alarm"}
                              </p>
                            )}
                          </>
                        ) : (
                          Object.entries(content)
                            .map(
                              ([key, value]) => `${key}: ${textValue(value)}`,
                            )
                            .join("\n") || "—"
                        )}
                      </div>
                    </td>
                  ))}
                  {run.snapshot.scorers.map((s) => {
                    const score = r.scores.find((v) => v.scorerId === s.id);
                    return (
                      <td key={s.id}>
                        <button
                          title={score?.reason}
                          onClick={() => setSample(r)}
                        >
                          <Pill tone={score?.passed ? "good" : "bad"}>
                            {score?.value.toFixed(2) ?? "—"}
                          </Pill>
                        </button>
                      </td>
                    );
                  })}
                  <td>{r.latencyMs} ms</td>
                  <td>${r.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>
            {run.status === "RUNNING" && !run.results.length
              ? "Waiting for simulated sample results…"
              : "No samples match these filters."}
          </Empty>
        )}
      </div>
      <Sheet
        open={sample !== null}
        onOpenChange={(open) => {
          if (!open) setSample(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Sample trace & feedback</SheetTitle>
            <SheetDescription>
              {sample?.id} · Simulated evidence
            </SheetDescription>
          </SheetHeader>
          {sample && (
            <div className="space-y-6 px-5 pb-6">
              <div className="flex gap-2">
                <Pill tone={sample.status === "PASS" ? "good" : "bad"}>
                  {sample.status}
                </Pill>
                <Pill>{sample.latencyMs} ms</Pill>
                <Pill>${sample.costUsd.toFixed(4)}</Pill>
              </div>
              <div>
                <h3 className="mb-3 font-medium">Execution trace</h3>
                <ol className="space-y-0 border-l pl-4">
                  {sample.trace.map((span, i) => (
                    <li key={i} className="relative pb-5">
                      <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{span.name}</span>
                        <span className="text-muted-foreground">
                          {span.durationMs} ms
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {span.detail}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="mb-3 font-medium">Scorer feedback</h3>
                {sample.scores.map((score) => {
                  const s = run.snapshot.scorers.find(
                    (v) => v.id === score.scorerId,
                  )!;
                  return (
                    <div
                      key={score.scorerId}
                      className="mb-3 rounded-lg border p-4"
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">
                          {s.name} · v{s.version}
                        </span>
                        <Pill tone={score.passed ? "good" : "bad"}>
                          {score.value.toFixed(2)}
                        </Pill>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {score.reason}
                      </p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-primary">
                          Scorer definition
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs">
                          {s.repoUrl
                            ? `Repository: ${s.repoUrl}\nScript: ${s.scriptPath}`
                            : s.definition}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </div>
              {sample.error && (
                <p role="alert" className="text-sm text-destructive">
                  {sample.error}
                </p>
              )}
              {(
                [
                  [
                    isGuardrail ? "Conversation (messages)" : "Input",
                    sample.input,
                  ],
                  [isGuardrail ? "Detected risk" : "Output", sample.output],
                  [
                    isGuardrail ? "Ground truth (has_issue)" : "Reference",
                    sample.reference,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <h3 className="mb-2 font-medium">{label}</h3>
                  <JsonPreview value={value} />
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Frame>
  );
}

interface DatasetSummary {
  dataset_id: string; dataset_version: number; name?: string; sample_count: number;
  status: string; completed: number; passed: number; failed: number; errors: number;
  pass_rate: number | null; average_latency_ms: number | null;
  scores: Array<{scorer_id:string;scorer_version?:string;average:number;count:number}>;
}
type ReportLatency = {p50_ms: number | null; p95_ms: number | null; count: number};
const latencyText = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)} ms`;

function runConcurrency(run:Evaluation) {
  return run.remote?.concurrency ?? run.snapshot.environment.runner?.concurrency;
}

function runLabel(run:Evaluation) {
  const {provider,guardrail_id}=run.snapshot.target;
  return [`Concurrency ${runConcurrency(run) ?? '—'}`,provider,guardrail_id].filter(Boolean).join(' · ');
}

function CompareRuns({sources,current,catalog,active,onClear,onApply}: {
  sources:Evaluation[]; current:Evaluation; catalog:Evaluation[]; active?:boolean;
  onClear?():void; onApply(source:Evaluation,reference:Evaluation):void;
}) {
  const [open,setOpen]=useState(false);
  const [sourceId,setSourceId]=useState(current.id);
  const [referenceId,setReferenceId]=useState('');
  const source=sources.find(run=>run.id===sourceId) ?? current;
  const sourceTarget=source.snapshot.target;
  const usesUploadedRows=(run:Evaluation)=>run.remote?.datasets?.some(dataset=>dataset.input_source==='upload');
  const datasetKeys=(run:Evaluation)=>run.remote?.datasets?.map(dataset=>`${dataset.dataset_id}:${dataset.dataset_version}`).sort().join('|');
  const sourceDatasets=datasetKeys(source);
  const candidates=catalog.filter(run=>run.remote?.execution_mode==='guardrail' && run.id!==source.id &&
    run.snapshot.target.id===sourceTarget.id && run.snapshot.target.version===sourceTarget.version &&
    !usesUploadedRows(source) && !usesUploadedRows(run) &&
    (!sourceDatasets || !datasetKeys(run) || sourceDatasets===datasetKeys(run)) &&
    (!source.remote?.concurrency_group || run.remote.concurrency_group!==source.remote.concurrency_group));
  const choices=new Map<string,Evaluation[]>();
  for(const run of candidates) {
    const key=run.remote?.concurrency_group ?? run.id;
    choices.set(key,[...(choices.get(key) ?? []),run]);
  }
  const reference=candidates.find(run=>run.id===referenceId);
  if(current.remote?.execution_mode!=='guardrail') return null;
  return <div className="flex gap-2">
    {active&&<Button variant="ghost" onClick={onClear}>Clear comparison</Button>}
    <Button variant="outline" onClick={()=>{setSourceId(current.id);setReferenceId('');setOpen(true);}}>Compare</Button>
    {open&&<Modal title="Compare runs" description={`Compare runs from ${sourceTarget.name} · v${sourceTarget.version} using the same published datasets.`} onClose={()=>setOpen(false)}
      footer={<Button disabled={!reference} onClick={()=>{if(reference){setOpen(false);onApply(source,reference);}}}>Apply comparison</Button>}>
      <Field label="A · Current evaluation run">
        <Select value={source.id} onChange={e=>{setSourceId(e.target.value);setReferenceId('');}}>
          {sources.map(run=><option key={run.id} value={run.id}>{runLabel(run)}</option>)}
        </Select>
      </Field>
      {!choices.size&&<p className="text-xs text-muted-foreground">{usesUploadedRows(source)
        ? 'This run uses uploaded cases. Choose a run using published datasets.'
        : 'No other runs match this evaluation version and dataset selection.'}</p>}
      <Field label="B · Comparison run">
        <Select value={referenceId} onChange={e=>setReferenceId(e.target.value)}>
          <option value="">Select a run</option>
          {[...choices].map(([id,runs])=>{
            const first=runs[0]!;
            const date=new Date(first.createdAt).toLocaleString();
            return first.remote?.concurrency_group
              ? <optgroup key={id} label={`Run group · ${date}`}>
                  {runs.slice().sort(compareRunOrder).map(run=><option key={run.id} value={run.id}>{runLabel(run)} · {run.status}</option>)}
                </optgroup>
              : <option key={id} value={first.id}>{runLabel(first)} · {date} · {first.status}</option>;
          })}
        </Select>
      </Field>
    </Modal>}
  </div>;
}

const runColors = ['#4338ca', '#0f766e', '#b45309', '#be185d', '#0369a1', '#7e22ce', '#4d7c0f', '#b91c1c'];
const runScoreColumns = [
  ['precision', 'Precision'], ['recall', 'Recall'], ['accuracy', 'Accuracy'], ['f1', 'F1'],
] as const;
const runLatencyColumns = [['p50_ms', 'P50'], ['p95_ms', 'P95']] as const;

function RunSummary({runs, onSelect}: {runs: Evaluation[]; onSelect(id: string): void}) {
  const projectId = useCurrentProjectId();
  const showEndpoint = runs.some(run=>run.remote?.execution_mode==='guardrail');
  const [metrics, setMetrics] = useState<Record<string, (GuardrailSummary & {latency?:ReportLatency}) | null>>({});
  const [chartMode, setChartMode] = useState<'scores'|'latency'>('scores');
  const inputs = JSON.stringify(runs.map(run => [run.remote!.experiment_id, run.status]));
  useEffect(() => {
    const members = JSON.parse(inputs) as Array<[string, Evaluation['status']]>;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const entries = await Promise.all(members.map(async ([id]) => {
        try {
          const report = await executionApi<GuardrailSummary & {latency?:ReportLatency}>(projectId, `reports/${encodeURIComponent(id)}?summary_only=true`);
          return [id, report] as const;
        } catch {
          return [id, null] as const;
        }
      }));
      if (!active) return;
      setMetrics(Object.fromEntries(entries));
      if (members.some(([,status]) => status==='RUNNING')) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    return () => { active=false; clearTimeout(timer); };
  }, [projectId, inputs]);
  const rows = runs.map((run, index) => ({
    run,
    color: runColors[index % runColors.length]!,
    report: metrics[run.remote!.experiment_id],
  }));
  const isLatency = !showEndpoint || chartMode === 'latency';
  const groups = isLatency
    ? runLatencyColumns.map(([key, label]) => ({label, values: rows.map(({report}) => report?.latency?.[key])}))
    : runScoreColumns.map(([key, label]) => ({label, values: rows.map(({report}) => report?.overall?.[key])}));
  const max = isLatency ? Math.max(1, ...groups.flatMap(group => group.values.map(value => value ?? 0))) : 1;
  const hasValues = groups.some(group => group.values.some(value => value != null));
  return <section className="space-y-2" aria-label="Run summary">
    <h2 className="text-sm font-semibold">Run summary</h2>
    <p className="text-xs text-muted-foreground">{runs.some(run=>run.remote?.serial_index!==undefined)
      ?'This group was configured to run sequentially.' : 'Runs can execute concurrently.'} Running results are provisional.</p>
    <Table><thead><tr><th>Concurrency</th>{showEndpoint&&<><th>Provider</th><th>Endpoint</th></>}<th>Status</th><th>Progress</th><th>Token usage</th>{showEndpoint&&runScoreColumns.map(([key,label])=><th key={key}>{label}</th>)}<th>P50</th><th>P95</th><th>Report</th></tr></thead>
      <tbody>{rows.map(({run,color,report})=>{
        const values=report?.latency;
        const {provider,guardrail_id}=run.snapshot.target;
        return <tr key={run.id}><td><span className="inline-flex items-center gap-2 tabular-nums">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{backgroundColor:color}}/>{runConcurrency(run)??'—'}
        </span></td>
          {showEndpoint&&<><td>{provider||'—'}</td><td>{guardrail_id||'—'}</td></>}
          <td>{run.status==='RUNNING'?run.remote!.phase:run.status}</td><td>{run.remote!.completed ?? 0} / {run.remote!.sample_count ?? '—'}</td>
          <td className="tabular-nums" title="Simulated usage: 128 tokens per measured request.">{values ? (values.count * 128).toLocaleString() : '—'}</td>
          {showEndpoint&&runScoreColumns.map(([key])=><td key={key} className="tabular-nums">{scoreText(report?.overall?.[key])}</td>)}
          <td>{latencyText(values?.p50_ms)}</td><td>{latencyText(values?.p95_ms)}</td>
          <td><Button variant="link" onClick={()=>onSelect(run.id)}>View report</Button></td></tr>;
      })}</tbody>
    </Table>
    <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="Run comparison">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Run comparison</h2>
        {showEndpoint&&<Select aria-label="Run comparison metric" className="h-8 w-auto" value={chartMode}
          onChange={event=>setChartMode(event.target.value==='latency' ? 'latency' : 'scores')}>
          <option value="scores">Scores</option>
          <option value="latency">Latency</option>
        </Select>}
      </div>
      {hasValues ? <>
        <div className="overflow-x-auto">
          <div className="flex min-w-[26rem] gap-2">
            <div aria-hidden="true" className="flex h-36 flex-col justify-between whitespace-nowrap text-right text-[10px] tabular-nums text-muted-foreground">
              {[1,.5,0].map(tick=><span key={tick}>{isLatency ? `${Number((max*tick).toFixed(1))} ms` : `${tick*100}%`}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 gap-3" aria-label={isLatency ? 'Guardrail latency by run' : 'Scores by run'}>
              {groups.map(({label,values})=><div key={label} className="min-w-0 flex-1 text-center">
                <div className="relative flex h-36 items-end justify-center gap-1 border-y px-1">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed"/>
                  {values.map((value,index)=>{
                    const {run,color}=rows[index]!;
                    const description=`${label} · ${runLabel(run)} · ${isLatency ? latencyText(value) : scoreText(value)}`;
                    return <div key={run.id} role="img" aria-label={description} title={description}
                      className="relative flex h-full w-full max-w-7 items-end justify-center">
                      {value == null ? <span aria-hidden="true" className="text-xs text-muted-foreground">—</span> :
                        <span aria-hidden="true" className="w-full rounded-t-sm" style={{height:`${value/max*100}%`,minHeight:2,backgroundColor:color}}/>}
                    </div>;
                  })}
                </div>
                <p className="mt-1 text-xs font-medium">{label}</p>
              </div>)}
            </div>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {rows.map(({run,color})=><li key={run.id} title={runLabel(run)} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{backgroundColor:color}}/>
            {runConcurrency(run) ?? '—'}{run.snapshot.target.provider && ` · ${run.snapshot.target.provider}`}
          </li>)}
        </ul>
      </> : <p className="py-4 text-xs text-muted-foreground">{Object.keys(metrics).length ? 'No measurements available yet.' : 'Loading run results…'}</p>}
    </section>
  </section>;
}

function LiveReport({ run, onBack, comparedReport, compareControl }: {
  run: Evaluation; onBack(): void; comparedReport:string; compareControl:ReactNode;
}) {
  const remote = run.remote!;
  const {state:catalog}=useWorkbench();
  const projectId = useCurrentProjectId();
  const isGuardrail = remote.execution_mode === 'guardrail';
  const [guardrailReport, setGuardrailReport] = useState<GuardrailSummary & {binding_results?: BindingResult[]}>({});
  const [binding, setBinding] = useState('ALL');
  const [outcome, setOutcome] = useState('ALL');
  const [strategy, setStrategy] = useState('ALL');
  const [latency, setLatency] = useState<ReportLatency|null>(null);
  const concurrency = remote.concurrency ?? run.snapshot.environment.runner?.concurrency;
  const [samples, setSamples] = useState<SampleResult[]>([]);
  const [aspectReport,setAspectReport]=useState<{bindings:Array<{id:string;name:string;aspect:string;version:string|null;dataset_id:string;provenance:string;definition:unknown}>;aspects:Array<{aspect:string;source:string;evaluated:number;passed:number;errors:number;missing:number;pending:number;pass_rate:number|null}>;dataset_aspects?:Array<{dataset_id:string;aspect:string;source:string;pass_rate:number|null;evaluated:number;passed:number;errors:number;missing:number}>}>({bindings:[],aspects:[]});
  const [datasetSummaries, setDatasetSummaries] = useState<DatasetSummary[]>([]);
  const [reportTab,setReportTab]=useState('Overview');
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [datasetFilter, setDatasetFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState("");
  const [samplePage, setSamplePage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const samplesPath = `experiments/${encodeURIComponent(remote.experiment_id)}/samples`;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sample = samples.find(s => s.id === selectedId);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setError("");
    async function refresh() {
      try {
        let summaries: DatasetSummary[] = [];
        {
          try {
            const report = await executionApi<{datasets:DatasetSummary[];latency?:ReportLatency}&typeof aspectReport&typeof guardrailReport>(projectId, `reports/${encodeURIComponent(remote.experiment_id)}?summary_only=true`);
            summaries = report.datasets ?? [];
            if(active)setLatency(report.latency??null);
            if(active)setGuardrailReport(report);
            if(active)setAspectReport({bindings:report.bindings??[],aspects:report.aspects??[],dataset_aspects:report.dataset_aspects??[]});
          } catch (e) {
            if ((e as {status?:number}).status !== 404 || run.status !== 'RUNNING') throw e;
            summaries = (remote.datasets??[]).map(d=>({...d,status:'QUEUED',completed:0,passed:0,failed:0,errors:0,pass_rate:null,average_latency_ms:null,scores:[]}));
          }
        }
        if (active) { setDatasetSummaries(summaries); setError(""); }
      } catch (e) { if (active) setError((e as Error).message); }
      finally {
        if (active) {
          setLoading(false);
          if (run.status === "RUNNING") timer = setTimeout(refresh, 3000);
        }
      }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [projectId, remote.experiment_id, run.status, retry]);
  useEffect(() => {
    if (reportTab !== 'Samples') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setSamplesLoading(true);
    setSamplesError("");
    async function refreshSamples() {
      try {
        const rows = await executionPages<SampleResult>(projectId, samplesPath);
        if (active) { setSamples(rows); setSamplesError(""); }
      } catch (error) {
        if (active) setSamplesError((error as Error).message);
      } finally {
        if (active) {
          setSamplesLoading(false);
          if (run.status === 'RUNNING') timer = setTimeout(refreshSamples, 5000);
        }
      }
    }
    void refreshSamples();
    return () => { active = false; clearTimeout(timer); };
  }, [projectId, samplesPath, reportTab, retry, run.status]);
  useEffect(() => setSamplePage(0), [datasetFilter, binding, outcome, strategy]);

  const visibleSamples = samples.filter(row => {
    if (datasetFilter !== 'ALL' && (row.dataset_id ?? run.snapshot.datasetId) !== datasetFilter) return false;
    if (!isGuardrail) return true;
    const result = row.guardrail_result;
    return (binding === 'ALL' || result?.binding_ids.includes(binding)) &&
      (strategy === 'ALL' || result?.strategy === strategy) &&
      (outcome === 'ALL' || (outcome === 'ERROR' ? (result?.status ?? row.status) === 'ERROR' :
        result?.classifications.some(item => item.outcome === outcome && (binding === 'ALL' || item.binding_id === binding))));
  });
  const pageCount = Math.max(1, Math.ceil(visibleSamples.length / 100));
  const currentPage = Math.min(samplePage, pageCount - 1);
  const pageSamples = visibleSamples.slice(currentPage * 100, (currentPage + 1) * 100);
  const strategies = [...new Set(samples.flatMap(row => row.guardrail_result?.strategy ? [row.guardrail_result.strategy] : []))];
  const datasetNames = new Map(remote.datasets?.map(dataset => [dataset.dataset_id, dataset.name]));
  for (const dataset of datasetSummaries) {
    if (dataset.name) datasetNames.set(dataset.dataset_id, dataset.name);
  }
  const scorerGroups = new Map<string, {id:string; name:string; version:string|null; definition:unknown; datasets:Set<string>}>();
  for (const binding of aspectReport.bindings) {
    const key = JSON.stringify([binding.id, binding.version, binding.definition]);
    let group = scorerGroups.get(key);
    if (!group) {
      group = {id:binding.id, name:binding.name, version:binding.version, definition:binding.definition, datasets:new Set()};
      scorerGroups.set(key, group);
    }
    group.datasets.add(binding.dataset_id);
  }
  for (const dataset of datasetSummaries) {
    for (const score of dataset.scores) {
      const version = score.scorer_version == null ? null : String(score.scorer_version);
      const existing = [...scorerGroups.values()].find(group => group.id === score.scorer_id
        && (version === null || String(group.version) === version) && group.datasets.has(dataset.dataset_id));
      if (existing) continue;
      const key = JSON.stringify([score.scorer_id, version, null]);
      let group = scorerGroups.get(key);
      if (!group) {
        group = {id:score.scorer_id, name:score.scorer_id, version, definition:null, datasets:new Set()};
        scorerGroups.set(key, group);
      }
      group.datasets.add(dataset.dataset_id);
    }
  }
  return <Frame title={run.name} description={runLabel(run)}>
    <div className="flex items-center justify-between"><Button variant="ghost" onClick={onBack}><ArrowLeft/>{remote.concurrency_group ? "Back to run group" : "All reports"}</Button><div className="flex items-center gap-2">{compareControl}<Button variant="outline" onClick={()=>setConfigurationOpen(true)}>Configuration</Button><Pill>{run.status}</Pill></div></div>
    <Tabs items={['Overview','Samples','Traces']} active={reportTab} onChange={setReportTab}/>
    {reportTab==='Overview'&&!isGuardrail&&<section aria-label="Run latency" className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border px-3 py-2 text-sm">
      <span>P50 <strong>{latencyText(latency?.p50_ms)}</strong></span>
      <span>P95 <strong>{latencyText(latency?.p95_ms)}</strong></span>
      <span className="text-muted-foreground">Sample execution latency</span>
    </section>}
    {reportTab==='Traces'&&<TraceViewer evaluationId={remote.experiment_id} running={run.status==='RUNNING'}/>}
    {reportTab==='Overview'&&remote.execution_mode==='guardrail'&&<GuardrailReport evaluationId={remote.experiment_id} running={run.status==='RUNNING'}
      report={guardrailReport} groupComparison={{
        grouped:!!remote.concurrency_group, reportId:run.id, catalog:catalog.evaluations, concurrency,
        selected:comparedReport, onSelect:()=>{}, managed:true,
      }}/>}
    {error&&<div role="alert" className="text-sm text-destructive">Report loading failed: {error} <Button variant="outline" onClick={()=>setRetry(v=>v+1)}>Retry</Button></div>}
    {reportTab==='Overview'&&remote.execution_mode!=='guardrail'&&<section className="space-y-2"><h2 className="font-semibold">Results by dataset and aspect</h2><p className="text-xs text-muted-foreground">Aspect score = sample pass rate across all required scorers. Scorer score = mean on a 0–1 scale. Errors count as not passed.</p>
    <Table><thead><tr><th>Dataset</th><th>Aspect</th><th>Aspect score</th><th>Scorer · version</th><th>Scorer score</th><th>Evidence</th></tr></thead><tbody>{aspectReport.bindings.map(b=>{const d=datasetSummaries.find(d=>d.dataset_id===b.dataset_id);const a=aspectReport.dataset_aspects?.find(a=>a.dataset_id===b.dataset_id&&a.aspect===b.aspect);const score=d?.scores.find(s=>s.scorer_id===b.id&&(!s.scorer_version||String(s.scorer_version)===String(b.version)));return <tr key={b.dataset_id+b.id}><td>{d?.name??remote.datasets?.find(d=>d.dataset_id===b.dataset_id)?.name??b.dataset_id}</td><td>{aspectLabels[b.aspect as keyof typeof aspectLabels]??'Unclassified'}</td><td>{a?.pass_rate==null?'—':`${(a.pass_rate*100).toFixed(1)}%`}<p className="text-xs text-muted-foreground">{a?`${a.passed}/${a.evaluated} passed · ${a.source}`:'Not evaluated'}</p></td><td>{b.name} · v{b.version??'?'}</td><td>{score?score.average.toFixed(3):'—'}</td><td><Button variant="link" onClick={()=>{setDatasetFilter(b.dataset_id);setReportTab('Samples');}}>View samples</Button></td></tr>;})}</tbody></Table>
    {!aspectReport.bindings.length&&<p className="text-sm text-muted-foreground">Historical scorer definitions unavailable. {remote.scorer_ids.join(', ')} — unclassified.</p>}
    </section>}
    {remote.feature_modes?.scoring_enabled === false && <p role="status" className="rounded-lg border border-amber-500/30 p-3 text-sm">Demo scores — illustrative only. These results do not measure evaluation quality.</p>}
    {reportTab==='Overview'&&remote.execution_mode!=='guardrail'&&remote.feature_modes?.effective_reflection_mode === 'mock' && <details aria-label="Reflection" className="rounded-lg border p-3 space-y-2"><summary className="cursor-pointer text-sm">Demo reflection</summary>
      <h2 className="font-medium">Reflection</h2>
      <p className="text-sm text-muted-foreground">Demo reflection — illustrative only</p>
      <p className="text-sm">This report demonstrates how findings and recommendations will appear. Review sample evidence and scoring criteria before drawing quality conclusions.</p>
    </details>}
    {reportTab==='Overview'&&remote.execution_mode!=='guardrail'&&<section aria-label="Evaluation overview" className="overflow-hidden rounded-xl border bg-card">
      <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3"><Pill tone={run.status==='COMPLETED'?'good':run.status==='FAILED'?'bad':'neutral'}>{run.status === "RUNNING" ? remote.phase : run.status}</Pill><h2 className="text-sm font-medium">{run.status === "RUNNING" ? "Evaluation in progress" : run.status === "FAILED" ? "Evaluation failed" : run.status === "CANCELLED" ? "Evaluation cancelled" : "Evaluation completed"}</h2></div>
        <span className="text-xs text-muted-foreground">{remote.completed}{remote.sample_count!==undefined?` / ${remote.sample_count}`:''} samples processed{run.status==='RUNNING'?' · Refreshes every 3 seconds':''}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Datasets</dt><dd className="mt-1 truncate font-medium" title={remote.datasets?.map(d=>`${d.name} · v${d.dataset_version}`).join(', ')??run.snapshot.dataset.name}>{remote.datasets?.length?`${remote.datasets.length} datasets`:`${run.snapshot.dataset.name} · v${run.snapshot.dataset.version}`}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Scorers</dt><dd className="mt-1 truncate font-medium" title={remote.scorer_ids.join(', ')}>{remote.scorer_ids.join(', ')}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Model</dt><dd className="mt-1 truncate font-medium" title={remote.model_id}>{remote.model_id==='none'?'No model':remote.model_id}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Execution environment</dt><dd className="mt-1 truncate font-medium" title={run.snapshot.environment.name}>{run.snapshot.environment.name} · v{run.snapshot.environment.version}</dd></div>
      </dl>
      {remote.scoring_mode === "mock" && <p className="border-t border-amber-500/15 bg-amber-500/5 px-4 py-2 text-xs text-muted-foreground">Scores are development mocks (fixed 1). They do not represent evaluation quality.</p>}
      {remote.error && <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">{remote.error}</p>}
      <details className="border-t px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Run identifiers · {remote.runtime === 'docker'?'Docker':'Kubernetes'}</summary>
        <dl className="mt-3 grid gap-3 pb-1 sm:grid-cols-2"><div><dt className="text-muted-foreground">Experiment ID</dt><dd className="mt-1 break-all font-mono select-all">{remote.experiment_id}</dd></div><div><dt className="text-muted-foreground">{remote.runtime === 'docker'?'Docker container':'Kubernetes Job'}</dt><dd className="mt-1 break-all font-mono select-all">{remote.container_name??run.id}</dd></div></dl>
      </details>
    </section>}
    {configurationOpen && <Modal title="Configuration" description="Datasets and scorers recorded for this run."
      onClose={()=>setConfigurationOpen(false)}
      footer={<div className="flex justify-end"><Button variant="outline" onClick={()=>setConfigurationOpen(false)}>Close configuration</Button></div>}>
      <section aria-label="Datasets" className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Datasets</h2><Pill>{datasetSummaries.length}</Pill>
        </div>
        <p className="text-xs text-muted-foreground">Select a dataset to view its samples. Pass rates include errors as not passed.</p>
        {datasetSummaries.length ? <Table>
          <thead><tr><th>Dataset</th><th>Status</th><th>Progress</th><th>Pass rate</th><th>Failed / errors</th><th>Avg. duration</th></tr></thead>
          <tbody>{datasetSummaries.map(dataset => <tr key={dataset.dataset_id}>
            <td>
              <Button variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={()=>{
                setDatasetFilter(dataset.dataset_id);setBinding('ALL');setOutcome('ALL');setStrategy('ALL');
                setSelectedId(null);setReportTab("Samples");setConfigurationOpen(false);
              }}>{dataset.name??datasetNames.get(dataset.dataset_id)??dataset.dataset_id} · v{dataset.dataset_version}</Button>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{dataset.dataset_id}</div>
            </td>
            <td><Pill>{dataset.status}</Pill></td><td>{dataset.completed} / {dataset.sample_count}</td>
            <td>{dataset.pass_rate===null?'—':`${(dataset.pass_rate*100).toFixed(1)}%`}</td>
            <td>{dataset.failed} / {dataset.errors}</td>
            <td>{dataset.average_latency_ms===null?'—':`${Math.round(dataset.average_latency_ms)} ms`}</td>
          </tr>)}</tbody>
        </Table> : <p className="text-sm text-muted-foreground">No dataset statistics available yet.</p>}
      </section>
      <section aria-label="Scorers" className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Scorers</h2><Pill>{scorerGroups.size}</Pill>
        </div>
        <p className="text-xs text-muted-foreground">Recorded scorer versions and their dataset assignments.</p>
        {scorerGroups.size ? <ul className="divide-y rounded-md border">
          {[...scorerGroups].map(([key, scorer]) => <li key={key} className="space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{scorer.name}</span>
              {scorer.version!=null&&<Pill>v{scorer.version}</Pill>}
              {scorer.name!==scorer.id&&<span className="break-all font-mono text-xs text-muted-foreground">{scorer.id}</span>}
            </div>
            <ul className="space-y-1 text-xs">{[...scorer.datasets].map(id => {
              const dataset = datasetSummaries.find(item=>item.dataset_id===id);
              const score = dataset?.scores.find(item=>item.scorer_id===scorer.id &&
                (item.scorer_version==null || String(item.scorer_version)===String(scorer.version)));
              return <li key={id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{datasetNames.get(id)??id}</span>
                {datasetNames.get(id)&&datasetNames.get(id)!==id&&<span className="break-all font-mono text-muted-foreground">{id}</span>}
                {score&&<span className="text-muted-foreground">Average {score.average.toFixed(3)} (n={score.count})</span>}
              </li>;
            })}</ul>
            {scorer.definition!=null&&<details className="text-xs">
              <summary className="cursor-pointer font-medium">View scorer configuration</summary>
              <JsonPreview value={scorer.definition}/>
            </details>}
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">No scorer configuration recorded.</p>}
      </section>
    </Modal>}
    {reportTab==='Samples'&&<section className="space-y-3" aria-label="Sample results">
      <h2 className="text-lg font-medium">Sample results</h2>
      {remote.datasets?.length&&<Select aria-label="Filter samples by dataset" value={datasetFilter} onChange={e=>{setDatasetFilter(e.target.value);setSelectedId(null);}}><option value="ALL">All datasets</option>{remote.datasets.map(d=><option key={d.dataset_id} value={d.dataset_id}>{d.name} · v{d.dataset_version}</option>)}</Select>}
      {isGuardrail&&<div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Guardrail aspect" value={binding} onChange={e=>setBinding(e.target.value)}>
          <option value="ALL">All aspects</option>
          {guardrailReport.binding_results?.map(b=><option key={b.binding_id} value={b.binding_id}>{b.aspect_name} · {b.dataset_id}</option>)}
        </Select>
        <Select aria-label="Classification" value={outcome} onChange={e=>setOutcome(e.target.value)}>
          <option value="ALL">All outcomes</option>
          {['TP','FP','TN','FN','ERROR'].map(value=><option key={value} value={value}>{value}</option>)}
        </Select>
        <Select aria-label="Strategy" value={strategy} onChange={e=>setStrategy(e.target.value)}>
          <option value="ALL">All strategies</option>
          {strategies.map(value=><option key={value} value={value}>{value}</option>)}
        </Select>
        <span className="text-xs text-muted-foreground">{visibleSamples.length} / {samples.length} samples</span>
      </div>}
      <p className="text-sm text-muted-foreground">Duration includes target execution and scoring. Select a sample to inspect full input, response and scorer feedback.</p>

      {samplesError&&<div role="alert" className="text-sm text-destructive">{samplesError} <Button variant="outline" onClick={()=>setRetry(v=>v+1)}>Retry</Button></div>}
      {pageCount > 1 && <div className="flex items-center gap-2 text-xs">
        <Button variant="outline" size="xs" disabled={currentPage===0} onClick={()=>setSamplePage(currentPage-1)}>Previous</Button>
        <span>Page {currentPage+1} of {pageCount}</span>
        <Button variant="outline" size="xs" disabled={currentPage===pageCount-1} onClick={()=>setSamplePage(currentPage+1)}>Next</Button>
      </div>}
      {samplesLoading ? <p role="status">Loading samples…</p> : !samples.length && !samplesError ? <Empty>No sample results have been stored yet.</Empty> : null}
      {!samplesLoading&&samples.length>0&&!visibleSamples.length&&<Empty>No samples match the current filters.</Empty>}
      {visibleSamples.length > 0 && <Table>
        <thead><tr><th>Sample</th><th>Dataset</th><th>Status</th>{isGuardrail&&<><th>Strategy</th><th>Outcome</th><th>HTTP</th><th>Guardrail latency</th></>}<th>Duration</th><th>Scores</th><th>Input</th><th>Response</th></tr></thead>
        <tbody>{pageSamples.map(row => <tr key={row.id}>
          <td><Button variant="link" onClick={() => setSelectedId(row.id)}>{row.id}<ChevronRight /></Button></td>
          <td>{remote.datasets?.find(d=>d.dataset_id===row.dataset_id)?.name??row.dataset_id??run.snapshot.dataset.name} · v{row.dataset_version??run.snapshot.dataset.version}</td>
          <td><Pill tone={row.status === "PASS" ? "good" : "bad"}>{row.status}</Pill>{row.error && <p className="text-destructive">{row.error}</p>}</td>
          {isGuardrail&&<>
            <td>{row.guardrail_result?.strategy || '—'}</td>
            <td>{row.guardrail_result?.status === 'ERROR' ? 'ERROR' : row.guardrail_result?.classifications
              .filter(item=>binding==='ALL'||item.binding_id===binding).map(item=>item.outcome).join(', ') || '—'}</td>
            <td>{row.guardrail_result?.http_status ?? '—'}</td>
            <td className="whitespace-nowrap">{latencyText(row.guardrail_result?.guardrail_latency_ms)}</td>
          </>}
          <td className="whitespace-nowrap">{Math.round(row.latencyMs)} ms</td>
          <td>{row.scores.length ? row.scores.map(score => <div key={score.scorerId} className="whitespace-nowrap">{score.scorerId}: {score.value.toFixed(2)}</div>) : "—"}</td>
          <td className="max-w-72"><div className="line-clamp-3 break-words">{textValue(row.input)}</div></td>
          <td className="max-w-72"><div className="line-clamp-3 break-words">{textValue(row.output)}</div></td>
        </tr>)}</tbody>
      </Table>}
    </section>}
    <Sheet open={!!sample} onOpenChange={open => { if (!open) setSelectedId(null); }}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Sample {sample?.id}</SheetTitle><SheetDescription>Persisted input, response, duration and scoring details.</SheetDescription></SheetHeader>
        {sample && <div className="space-y-6 px-5 pb-6">
          <div className="flex gap-3"><Pill>{sample.status}</Pill><Pill>{Math.round(sample.latencyMs)} ms</Pill></div>
          {sample.error && <p role="alert" className="text-destructive">{sample.error}</p>}
          {([['Input', sample.input], ['Response', sample.output], ['Reference', sample.reference]] as const).map(([label, value]) => <section key={label}><h3 className="mb-2 font-medium">{label}</h3><JsonPreview value={value} /></section>)}
          {sample.guardrail_result&&<section>
            <h3 className="mb-2 font-medium">Guardrail request details</h3>
            <p className="mb-2 text-sm text-muted-foreground">HTTP {sample.guardrail_result.http_status ?? '—'} · Guardrail {latencyText(sample.guardrail_result.guardrail_latency_ms)} · Scorer {latencyText(sample.guardrail_result.scorer_latency_ms)} · Mock cost ${sample.guardrail_result.cost.amount.toFixed(4)}</p>
            <JsonPreview value={sample.guardrail_result}/>
          </section>}
          <section><h3 className="mb-2 font-medium">Scores</h3>{sample.scores.map(score => <div key={score.scorerId} className="mb-3 rounded-lg border p-4"><p>{score.scorerId}: {score.value.toFixed(2)} · {score.passed ? "PASS" : "FAIL"}</p><p className="mt-2 text-sm text-muted-foreground">{score.reason}</p></div>)}</section>
          <section><h3 className="mb-2 font-medium">Execution trace</h3>{sample.trace.map((span, i) => <div key={i} className="mb-3"><p>{span.name} · {Math.round(span.durationMs)} ms</p><p className="text-sm text-muted-foreground">{span.detail}</p></div>)}</section>
        </div>}
      </SheetContent>
    </Sheet>
    <Button disabled={loading || !!error || exporting} variant="outline" onClick={async () => {
      setExporting(true);
      try {
        const results = await executionPages<SampleResult>(projectId, samplesPath);
        download(`${run.id}.json`, {...run, simulated: false, datasetSummaries, results});
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setExporting(false);
      }
    }}><Download />{exporting ? 'Exporting…' : 'Export run'}</Button>
  </Frame>;
}
