import {executionApi} from "./remote";
import {useCurrentProjectId} from "@/hooks/use-project";
import {DeleteResource} from './delete-resource';
import {ExecutionEditor,defaultExecution} from "./execution-editor";
import {aspectLabels} from "./criteria";
import {CriteriaEditor,CriteriaSummary} from "./criteria-ui";
import { ScorerGuide } from "./scorer-guide";
import { useState } from "react";
import { Plus, Braces, Sparkles } from "lucide-react";
import type { Dataset, Scorer } from "./contracts";
import { clone, publishScorer, validateScorerSource, uid } from "./domain";
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

const pythonScriptSource = {
  kind: "CODE" as const,
  execution: defaultExecution("CODE"),
  repoUrl: "",
  scriptPath: "",
};
const scorerTypeLabels = {
  CODE: "Python script (Git)",
  LLM_JUDGE: "LLM judge",
  RULE: "Rule",
};

export function ScorersPage() {
  const { state, saveScorer } = useWorkbench();
  const [pageError,setPageError]=useState("");
  const [editing, setEditing] = useState<Scorer | null>(null);
  const [filter, setFilter] = useState("All scorers");
  const [aspect,setAspect]=useState("ALL");
  const [query, setQuery] = useState("");
  const scorers = state.scorers.filter(
    (s) =>
      (filter === "All scorers" ||
        (filter === "Built-in"
          ? s.source === "BUILT_IN"
          : s.source === "CUSTOM")) &&
      (aspect==="ALL" || s.draft.criteria?.aspect===aspect) &&
      s.draft.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Frame
      title="Scorers"
      description="Choose an aspect, configure a scoring method, then test and publish."
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
                ...pythonScriptSource,
                definition: "",
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
      <ErrorText message={pageError}/>
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
      <Field label="Filter by aspect"><Select value={aspect} onChange={e=>setAspect(e.target.value)}><option value="ALL">All aspects</option>{Object.entries(aspectLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select></Field>
      <Table>
        <thead>
          <tr>
            <th>Scorer</th>
            <th>Aspect</th>
            <th>Type</th>
            <th>Published</th>
            <th>Threshold</th>
            <th>Status</th>
            <th>Used by evaluations</th>
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
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{s.id}</p>
                    <p className="mt-1 max-w-xs line-clamp-2 text-xs text-muted-foreground">
                      {s.draft.description}
                    </p>
                  </div>
                </div>
              </td>
              <td><Pill>{s.draft.criteria?aspectLabels[s.draft.criteria.aspect]:"Unspecified"}</Pill></td>              <td>
                {s.draft.kind === "LLM_JUDGE"
                  ? "LLM judge"
                  : s.draft.kind === "CODE"
                    ? "Git script"
                    : "Rule"}
              </td>
              <td>
                {s.versions.length ? `v${s.versions.at(-1)!.version}` : "Draft"}
              </td>
              <td>≥ {s.versions.at(-1)?.threshold ?? s.draft.threshold}</td>
              <td>
                <Pill tone={s.enabled ? "good" : "neutral"}>
                  {!s.enabled?"Disabled":s.draft.execution?(s.draft.execution.engine==="git"?"Git configured":"Configured"):"Needs configuration"}
                </Pill>
              </td>
              <td><DatasetUsage datasets={state.datasets} scorerId={s.id} /></td>
              <td>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(clone(s))}>
                    {s.source === "BUILT_IN" ? "Inspect" : "Manage"}
                  </Button>
                  <DeleteResource collection="scorers" id={s.id} name={s.draft.name}/>{s.source === "CUSTOM" && (
                    <Button
                      variant="ghost"
                      onClick={() => void saveScorer({...s,enabled:!s.enabled}).catch(e=>setPageError((e as Error).message))}
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
              <td colSpan={8} className="text-center text-muted-foreground">
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
          onSave={async (scorer) => { await saveScorer(scorer); setEditing(null); }}
        />
      )}
    </Frame>
  );
}
function DatasetUsage({ datasets, scorerId }: { datasets: Dataset[]; scorerId: string }) {
  const {state}=useWorkbench();
  const usage=state.targets.flatMap(t=>(t.evaluation_config?.guardrail_bindings??[]).filter(b=>b.scorer_id===scorerId).map(b=>({target:t,binding:b})));
  return usage.length ? <ul className="space-y-1 text-xs">{usage.map(({target,binding})=><li key={`${target.id}:${binding.dataset_id}`}><span className="font-medium">{target.name}</span> · {datasets.find(d=>d.id===binding.dataset_id)?.draft.name??binding.dataset_id} v{binding.dataset_version} · scorer v{binding.scorer_version}</li>)}</ul> : <p className="text-xs text-muted-foreground">Not used by a configured evaluation</p>;
}

function ScorerEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Scorer;
  onSave(s: Scorer): Promise<void>;
  onClose(): void;
}) {
  const { state } = useWorkbench();
  const [scorer, setScorer] = useState(() => clone(initial));
  const [tab, setTab] = useState("Definition");
  const [error, setError] = useState("");
  const [sample, setSample] = useState(
    initial.id === "sc-tone"
      ? JSON.stringify({
          input: { messages: state.datasets.find((d) => d.id === "ds-guardrail")?.versions[0]?.rows[0]?.messages ?? [] },
          output: { has_issue: false, decision: "ALLOW", reason: "Safe request about the user's own account." },
          reference: { has_issue: false },
        }, null, 2)
      : '{"input":"Help me reset my password", "output":"Use the secure reset link", "reference":"Explain the reset flow"}',
  );
  const [testResult, setTestResult] = useState<object | null>(null);
  const readonly = scorer.source === "BUILT_IN";
  const d = scorer.draft;
  const patch = (value: Partial<Scorer["draft"]>) => {
    setScorer((s) => ({ ...s, draft: { ...s.draft, ...value } }));
    setTestResult(null);
  };
  const [saving,setSaving]=useState(false);
  const project=useCurrentProjectId();
  const [executionValid,setExecutionValid]=useState(true);
  const save = async (publish: boolean) => {
    setSaving(true);
    try {
      if(!executionValid) throw new Error("Fix the rule value before saving.");
      if (!d.name.trim()) throw new Error("Name is required.");
      if (!Number.isFinite(d.threshold) || d.threshold < 0 || d.threshold > 1)
        throw new Error("Threshold must be between 0 and 1.");
      const draft={...d};
      if(draft.kind==="CODE"){
        if(draft.execution?.engine==='git'&&draft.execution.commit){
          draft.execution={...draft.execution,repo_url:draft.repoUrl??'',script_path:draft.scriptPath??''};
        }else{
          if(publish)throw new Error("Pin a Git commit in Execution before publishing.");
          delete draft.execution;
        }
      }
      if(publish && draft.execution?.engine==='git')await executionApi(project,'scorers/actions/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      if(publish && !draft.execution) throw new Error("Configure an execution engine before publishing.");
      if(!draft.criteria)draft.criteria={aspect:'custom',subject:'Target output',expectation:'Configured check passes',requirements:'Use executable configuration',evidence:'Configured inputs'};
      const updated={...scorer,draft};
      await onSave(publish ? publishScorer(updated) : updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {setSaving(false);}
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
          ? "Example specification. Use this template to create and save your own scorer."
          : "Save drafts or publish a new version. Existing evaluations retain their original scorer version."
      }
      onClose={onClose}
    >
      <Tabs
        items={["Definition", "Execution", "Versions", "Usage"]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Definition" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *">
            <Input
              disabled={readonly}
              value={d.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Scorer type">
            <Input readOnly className="bg-muted/40" value={scorerTypeLabels[d.kind]} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Input
                disabled={readonly}
                value={d.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Aspect"><Select value={d.criteria?.aspect??'custom'} disabled={readonly} onChange={e=>patch({criteria:{aspect:e.target.value as import('./criteria').EvaluationCriteria['aspect'],subject:d.criteria?.subject??'Target output',expectation:d.criteria?.expectation??'Configured check passes',requirements:d.criteria?.requirements??'Use executable configuration',evidence:d.criteria?.evidence??'Configured inputs'}})}>{Object.entries(aspectLabels).map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select></Field>




          {d.kind === "CODE" && !readonly && (
            <>
              <div className="sm:col-span-2">
                <Field
                  label="Git repository *"
                  hint="HTTPS or SSH Git address. The runner fetches the pinned commit for each evaluation."
                >
                  <Input
                    placeholder="https://github.com/org/scorers.git"
                    value={d.repoUrl ?? ""}
                    onChange={(e) => patch({ repoUrl: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Script path *"
                  hint="Relative to the repository root, e.g. scorers/guardrail.py. Inputs: input, output, reference. Generic output: score (0–1), reason. Guardrail output: expected, predicted, outcome (TP/FP/TN/FN), reason."
                >
                  <Input
                    placeholder="scorers/guardrail.py"
                    value={d.scriptPath ?? ""}
                    onChange={(e) => patch({ scriptPath: e.target.value })}
                  />
                </Field>
              </div>
            </>
          )}
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
      {tab === "Execution" && <ExecutionEditor config={d} disabled={readonly} onValidityChange={setExecutionValid} onChange={execution=>patch({execution})}/>}
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
                if (!readonly && d.kind === "CODE") validateScorerSource(d);
                else if (!d.definition.trim())
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
      {tab === "Usage" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Read-only references from saved evaluation configurations. Pair datasets and scorers in Evaluation → Configure.
          </p>
          <DatasetUsage datasets={state.datasets} scorerId={scorer.id} />
        </div>
      )}
      <ErrorText message={error} />
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background pt-3">
        {tab==='Definition'&&<Button variant="outline" onClick={()=>setTab('Execution')}>Next: Configure scoring</Button>}
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {readonly && <Button onClick={()=>setScorer({...clone(scorer),id:uid("sc"),source:"CUSTOM",versions:[],
          draft:{...clone(d),...(d.kind==="CODE"?{}:pythonScriptSource),name:d.name+" (custom)"}})}>Use this template</Button>}
        {!readonly && (
          <>
            <Button disabled={saving} variant="outline" onClick={() => void save(false)}>
              Save draft
            </Button>
            <Button disabled={saving} onClick={() => void save(true)}>
              Publish v{scorer.versions.length + 1}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
