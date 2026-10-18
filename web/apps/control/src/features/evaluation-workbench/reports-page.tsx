import { ReportConfig } from "./report-config";
import { useState } from "react";
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
  if (evaluationId)
    return run ? (
      <ReportDetail key={run.id} run={run} onBack={() => onSelect("")} />
    ) : (
      <Frame
        title="Report unavailable"
        description="This evaluation does not exist in the current demo session."
      >
        <Empty>
          Refreshing resets demo-created evaluations.{" "}
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
                    {e.results.length}/{e.snapshot.dataset.rows.length}
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
      <ReportConfig snapshot={run.snapshot} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pass rate"
          value={
            run.results.length
              ? `${Math.round((passed / run.results.length) * 100)}%`
              : "—"
          }
          detail={`${passed} passed · ${run.results.length - passed} with findings`}
        />
        <Metric
          label="Samples scored"
          value={`${run.results.length} / ${run.snapshot.dataset.rows.length}`}
          detail={
            run.status === "CANCELLED"
              ? "Cancelled · partial results"
              : "All selected scorers per sample"
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
