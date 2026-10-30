import { ReportConfig } from "./report-config";
import { useEffect, useState } from "react";
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
  Pill,
  Select,
  Table,
  download,
  textValue,
} from "./ui";
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
  const run = state.evaluations.find((e) => e.id === evaluationId);
  if (evaluationId && run?.remote) return <LiveReport key={run.id} run={run} onBack={() => onSelect("")} />;
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
  const reports = state.evaluations.filter(
    (e) =>
      (!idQuery.trim() || e.id === idQuery.trim()) &&
      (targetId === "ALL" || e.snapshot.target.id === targetId),
  );
  return (
    <Frame
      title="Reports"
      description="Find an evaluation, inspect individual samples and trace every score back to its configuration."
    >
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <Field
          label="Evaluation ID"
          hint="Exact match. Paste the full ID from Eval."
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
              <th>Pass rate</th>
              <th>Samples</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((e) => {
              const passed = e.results.filter(
                (r) => r.status === "PASS",
              ).length;
              return (
                <tr key={e.id}>
                  <td>
                    <button
                      className="flex items-center gap-2 text-left font-medium hover:underline"
                      onClick={() => onSelect(e.id)}
                    >
                      <FileText className="size-4 text-primary" />
                      {e.name}
                    </button>
                    <p
                      className="mt-1 max-w-64 truncate font-mono text-xs text-muted-foreground"
                      title={e.id}
                    >
                      {e.id}
                    </p>
                  </td>
                  <td>
                    {e.snapshot.target.name}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.snapshot.target.kind} · v{e.snapshot.target.version}
                    </p>
                  </td>
                  <td>
                    <Pill tone={e.status === "COMPLETED" ? "good" : "neutral"}>
                      {e.status}
                    </Pill>
                  </td>
                  <td>
                    {e.results.length
                      ? `${Math.round((passed / e.results.length) * 100)}%`
                      : "—"}
                  </td>
                  <td>
                    {e.remote?.completed ?? e.results.length}/{e.remote?.sample_count ?? e.snapshot.dataset.rows.length}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => onSelect(e.id)}>
                      Inspect
                      <ArrowRight />
                    </Button>
                  </td>
                </tr>
              );
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
function LiveReport({ run, onBack }: {run: Evaluation; onBack(): void}) {
  const remote = run.remote!;
  const projectId = useCurrentProjectId();
  const [samples, setSamples] = useState<SampleResult[]>([]);
  const [datasetSummaries, setDatasetSummaries] = useState<DatasetSummary[]>([]);
  const [datasetFilter, setDatasetFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sample = samples.find(s => s.id === selectedId);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setSamples([]);
    setSelectedId(null);
    setLoading(true);
    setError("");
    async function refresh() {
      try {
        const rows = await executionPages<SampleResult>(projectId, `experiments/${encodeURIComponent(remote.experiment_id)}/samples`);
        let summaries: DatasetSummary[] = [];
        if (remote.datasets?.length) {
          try {
            const report = await executionApi<{datasets:DatasetSummary[]}>(projectId, `reports/${encodeURIComponent(remote.experiment_id)}?limit=1`);
            summaries = report.datasets ?? [];
          } catch (e) {
            if ((e as {status?:number}).status !== 404 || run.status !== 'RUNNING') throw e;
            summaries = remote.datasets.map(d=>({...d,status:'QUEUED',completed:0,passed:0,failed:0,errors:0,pass_rate:null,average_latency_ms:null,scores:[]}));
          }
        }
        if (active) { setSamples(rows); setDatasetSummaries(summaries); setError(""); }
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
  const visibleSamples = samples.filter(s=>datasetFilter==='ALL'||(s.dataset_id??run.snapshot.datasetId)===datasetFilter);
  const scorerKeys = [...new Set(datasetSummaries.flatMap(d=>d.scores.map(s=>JSON.stringify([s.scorer_id,s.scorer_version]))))];
  return <Frame title={run.name} description="Live evaluation · Persisted sample results">
    <div><Button variant="ghost" onClick={onBack}><ArrowLeft />All reports</Button></div>
    <section aria-label="Evaluation overview" className="overflow-hidden rounded-xl border bg-card">
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
    </section>
    {datasetSummaries.length>0&&<section className="space-y-3" aria-label="Dataset comparison">
      <h2 className="text-lg font-medium">Dataset comparison</h2>
      <p className="text-sm text-muted-foreground">Pass rates include processed samples; errors count as not passed. Scores average the samples scored by each scorer. In-progress results are provisional.</p>
      <Table><thead><tr><th>Dataset</th><th>Status</th><th>Progress</th><th>Pass rate</th><th>Failed / errors</th><th>Average duration</th>{scorerKeys.map(key=>{const [id,version]=JSON.parse(key);return <th key={key}>{id}{version?` · ${version}`:''}</th>;})}</tr></thead>
      <tbody>{datasetSummaries.map(d=><tr key={d.dataset_id}>
        <td><Button variant="link" onClick={()=>{setDatasetFilter(d.dataset_id);setSelectedId(null);}}>{d.name??d.dataset_id} · v{d.dataset_version}</Button></td>
        <td><Pill>{d.status}</Pill></td><td>{d.completed} / {d.sample_count}</td>
        <td>{d.pass_rate===null?'—':`${(d.pass_rate*100).toFixed(1)}%`}</td><td>{d.failed} / {d.errors}</td>
        <td>{d.average_latency_ms===null?'—':`${Math.round(d.average_latency_ms)} ms`}</td>
        {scorerKeys.map(key=>{const score=d.scores.find(s=>JSON.stringify([s.scorer_id,s.scorer_version])===key);return <td key={key}>{score?`${score.average.toFixed(3)} (n=${score.count})`:'—'}</td>;})}
      </tr>)}</tbody></Table>
    </section>}
    <section className="space-y-4" aria-label="Sample results">
      <h2 className="text-lg font-medium">Sample results</h2>
      {remote.datasets?.length&&<Select aria-label="Filter samples by dataset" value={datasetFilter} onChange={e=>{setDatasetFilter(e.target.value);setSelectedId(null);}}><option value="ALL">All datasets</option>{remote.datasets.map(d=><option key={d.dataset_id} value={d.dataset_id}>{d.name} · v{d.dataset_version}</option>)}</Select>}
      <p className="text-sm text-muted-foreground">Duration includes target execution and scoring. Select a sample to inspect full input, response and scorer feedback.</p>
      {error && <div role="alert" className="text-sm text-destructive">Sample loading failed: {error} <Button variant="outline" onClick={() => setRetry(v => v + 1)}>Retry</Button></div>}
      {loading ? <p role="status">Loading samples…</p> : !samples.length && !error ? <Empty>No sample results have been stored yet.</Empty> : null}
      {!loading&&samples.length>0&&!visibleSamples.length&&<Empty>No samples for this dataset yet.</Empty>}
      {visibleSamples.length > 0 && <Table>
        <thead><tr><th>Sample</th><th>Dataset</th><th>Status</th><th>Duration</th><th>Scores</th><th>Input</th><th>Response</th></tr></thead>
        <tbody>{visibleSamples.map(row => <tr key={row.id}>
          <td><Button variant="link" onClick={() => setSelectedId(row.id)}>{row.id}<ChevronRight /></Button></td>
          <td>{remote.datasets?.find(d=>d.dataset_id===row.dataset_id)?.name??row.dataset_id??run.snapshot.dataset.name} · v{row.dataset_version??run.snapshot.dataset.version}</td>
          <td><Pill tone={row.status === "PASS" ? "good" : "bad"}>{row.status}</Pill>{row.error && <p className="text-destructive">{row.error}</p>}</td>
          <td className="whitespace-nowrap">{Math.round(row.latencyMs)} ms</td>
          <td>{row.scores.length ? row.scores.map(score => <div key={score.scorerId} className="whitespace-nowrap">{score.scorerId}: {score.value.toFixed(2)}</div>) : "—"}</td>
          <td className="max-w-72"><div className="line-clamp-3 break-words">{textValue(row.input)}</div></td>
          <td className="max-w-72"><div className="line-clamp-3 break-words">{textValue(row.output)}</div></td>
        </tr>)}</tbody>
      </Table>}
    </section>
    <Sheet open={!!sample} onOpenChange={open => { if (!open) setSelectedId(null); }}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Sample {sample?.id}</SheetTitle><SheetDescription>Persisted input, response, duration and scoring details.</SheetDescription></SheetHeader>
        {sample && <div className="space-y-6 px-5 pb-6">
          <div className="flex gap-3"><Pill>{sample.status}</Pill><Pill>{Math.round(sample.latencyMs)} ms</Pill></div>
          {sample.error && <p role="alert" className="text-destructive">{sample.error}</p>}
          {([['Input', sample.input], ['Response', sample.output], ['Reference', sample.reference]] as const).map(([label, value]) => <section key={label}><h3 className="mb-2 font-medium">{label}</h3><JsonPreview value={value} /></section>)}
          <section><h3 className="mb-2 font-medium">Scores</h3>{sample.scores.map(score => <div key={score.scorerId} className="mb-3 rounded-lg border p-4"><p>{score.scorerId}: {score.value.toFixed(2)} · {score.passed ? "PASS" : "FAIL"}</p><p className="mt-2 text-sm text-muted-foreground">{score.reason}</p></div>)}</section>
          <section><h3 className="mb-2 font-medium">Execution trace</h3>{sample.trace.map((span, i) => <div key={i} className="mb-3"><p>{span.name} · {Math.round(span.durationMs)} ms</p><p className="text-sm text-muted-foreground">{span.detail}</p></div>)}</section>
        </div>}
      </SheetContent>
    </Sheet>
    <Button disabled={loading || !!error} variant="outline" onClick={() => download(`${run.id}.json`, {...run, simulated: false, datasetSummaries, results: samples})}><Download />Export run</Button>
  </Frame>;
}
