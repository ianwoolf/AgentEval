import { useState } from "react";
import { Plus, Braces, Sparkles } from "lucide-react";
import type { Scorer } from "./contracts";
import { clone, publishScorer, uid } from "./domain";
import { useWorkbench } from "./provider";
import {
  Button,
  ErrorText,
  Field,
  Frame,
  Input,
  JsonPreview,
  Modal,
  Pill,
  Select,
  Table,
  Tabs,
  Textarea,
} from "./ui";
export function ScorersPage() {
  const { state, setState } = useWorkbench();
  const [editing, setEditing] = useState<Scorer | null>(null);
  const [filter, setFilter] = useState("All scorers");
  const [query, setQuery] = useState("");
  const scorers = state.scorers.filter(
    (s) =>
      (filter === "All scorers" ||
        (filter === "Built-in"
          ? s.source === "BUILT_IN"
          : s.source === "CUSTOM")) &&
      s.draft.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Frame
      title="Scorers"
      description="Define how quality is measured. Publish custom scorers without changing historical evaluations."
      action={
        <Button
          onClick={() =>
            setEditing({
              id: uid("sc"),
              source: "CUSTOM",
              enabled: true,
              versions: [],
              draft: {
                name: "",
                description: "",
                kind: "LLM_JUDGE",
                definition:
                  'Evaluate {{input}}, {{output}} and {{reference}}.\nReturn {"score": 0.0, "reason": "..."}.',
                threshold: 0.8,
                notes: "",
              },
            })
          }
        >
          <Plus />
          New scorer
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          items={["All scorers", "Built-in", "Custom"]}
          active={filter}
          onChange={setFilter}
        />
        <Input
          aria-label="Search scorers"
          className="max-w-xs"
          placeholder="Search scorers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <th>Scorer</th>
            <th>Source</th>
            <th>Type</th>
            <th>Published</th>
            <th>Threshold</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scorers.map((s) => (
            <tr key={s.id}>
              <td>
                <div className="flex items-center gap-3">
                  {s.draft.kind === "CODE" ? (
                    <Braces className="size-5 text-primary" />
                  ) : (
                    <Sparkles className="size-5 text-primary" />
                  )}
                  <div>
                    <button
                      className="font-medium hover:underline"
                      onClick={() => setEditing(clone(s))}
                    >
                      {s.draft.name}
                    </button>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {s.draft.description}
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <Pill>{s.source === "BUILT_IN" ? "Built-in" : "Custom"}</Pill>
              </td>
              <td>
                {s.draft.kind === "LLM_JUDGE"
                  ? "LLM judge"
                  : s.draft.kind === "CODE"
                    ? "Code"
                    : "Rule"}
              </td>
              <td>
                {s.versions.length ? `v${s.versions.at(-1)!.version}` : "Draft"}
              </td>
              <td>≥ {s.versions.at(-1)?.threshold ?? s.draft.threshold}</td>
              <td>
                <Pill tone={s.enabled ? "good" : "neutral"}>
                  {s.enabled ? "Enabled" : "Disabled"}
                </Pill>
              </td>
              <td>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(clone(s))}>
                    {s.source === "BUILT_IN" ? "Inspect" : "Manage"}
                  </Button>
                  {s.source === "CUSTOM" && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          scorers: current.scorers.map((item) =>
                            item.id === s.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        }))
                      }
                    >
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!scorers.length && (
            <tr>
              <td colSpan={7} className="text-center text-muted-foreground">
                No scorers match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {editing && (
        <ScorerEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(scorer) => {
            setState((s) => ({
              ...s,
              scorers: s.scorers.some((item) => item.id === scorer.id)
                ? s.scorers.map((item) =>
                    item.id === scorer.id ? scorer : item,
                  )
                : [...s.scorers, scorer],
            }));
            setEditing(null);
          }}
        />
      )}
    </Frame>
  );
}
function ScorerEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Scorer;
  onSave(s: Scorer): void;
  onClose(): void;
}) {
  const [scorer, setScorer] = useState(() => clone(initial));
  const [tab, setTab] = useState("Definition");
  const [error, setError] = useState("");
  const [sample, setSample] = useState(
    '{"input":"Help me reset my password", "output":"Use the secure reset link", "reference":"Explain the reset flow"}',
  );
  const [testResult, setTestResult] = useState<object | null>(null);
  const readonly = scorer.source === "BUILT_IN";
  const d = scorer.draft;
  const patch = (value: Partial<Scorer["draft"]>) => {
    setScorer((s) => ({ ...s, draft: { ...s.draft, ...value } }));
    setTestResult(null);
  };
  const save = (publish: boolean) => {
    try {
      if (!d.name.trim()) throw new Error("Name is required.");
      if (!Number.isFinite(d.threshold) || d.threshold < 0 || d.threshold > 1)
        throw new Error("Threshold must be between 0 and 1.");
      onSave(publish ? publishScorer(scorer) : scorer);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={
        readonly
          ? d.name
          : initial.versions.length
            ? `Manage ${initial.draft.name}`
            : "New custom scorer"
      }
      description={
        readonly
          ? "System-maintained scorer. The definition is read-only."
          : "Save drafts or publish a new version. Existing evaluations retain their original scorer version."
      }
      onClose={onClose}
    >
      <Tabs
        items={["Definition", "Test", "Versions"]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Definition" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *">
            <Input
              disabled={readonly}
              value={d.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Scorer type">
            <Select
              disabled={readonly}
              value={d.kind}
              onChange={(e) =>
                patch({ kind: e.target.value as Scorer["draft"]["kind"] })
              }
            >
              <option value="LLM_JUDGE">LLM judge</option>
              <option value="CODE">Custom code</option>
              {readonly && <option value="RULE">Rule</option>}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                disabled={readonly}
                value={d.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label={d.kind === "CODE" ? "Code definition" : "Scoring rubric"}
              hint="Inputs: input, output, reference. Output: score (0–1), reason. Code is never executed in this UI."
            >
              <Textarea
                disabled={readonly}
                className="min-h-40 font-mono text-xs"
                value={d.definition}
                onChange={(e) => patch({ definition: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Pass threshold (0–1)">
            <Input
              disabled={readonly}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={Number.isFinite(d.threshold) ? d.threshold : ""}
              onChange={(e) => patch({ threshold: e.target.valueAsNumber })}
            />
          </Field>
          <Field label="Version notes *">
            <Input
              disabled={readonly}
              value={d.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
        </div>
      )}
      {tab === "Test" && (
        <div className="space-y-4">
          <p className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
            Simulated test only. Validates the sample shape and previews a fixed
            score; it does not evaluate your rubric or run code.
          </p>
          <Field label="Test sample (JSON)">
            <Textarea
              className="min-h-36 font-mono text-xs"
              value={sample}
              onChange={(e) => {
                setSample(e.target.value);
                setTestResult(null);
              }}
            />
          </Field>
          <Button
            variant="outline"
            onClick={() => {
              try {
                const parsed = JSON.parse(sample);
                if (
                  !parsed ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed) ||
                  !["input", "output", "reference"].every((key) =>
                    Object.hasOwn(parsed, key),
                  )
                )
                  throw new Error(
                    "Sample requires input, output and reference.",
                  );
                if (!d.definition.trim())
                  throw new Error("Add a definition first.");
                setTestResult({
                  simulated: true,
                  score: 0.85,
                  passed: 0.85 >= d.threshold,
                  reason:
                    "Fixed demo score. No definition or code was executed.",
                });
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Simulate test
          </Button>
          {testResult && <JsonPreview value={testResult} />}
        </div>
      )}
      {tab === "Versions" && (
        <div className="space-y-3">
          {!scorer.versions.length && (
            <p className="text-sm text-muted-foreground">
              No published versions yet.
            </p>
          )}
          {scorer.versions.toReversed().map((v) => (
            <details key={v.version} className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">
                v{v.version} · {v.notes}
              </summary>
              <div className="mt-3">
                <JsonPreview value={v} />
              </div>
            </details>
          ))}
        </div>
      )}
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {!readonly && (
          <>
            <Button variant="outline" onClick={() => save(false)}>
              Save draft
            </Button>
            <Button onClick={() => save(true)}>
              Publish v{scorer.versions.length + 1}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
