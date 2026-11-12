import {DeleteResource} from './delete-resource';
import {datasetCoverage} from "./dataset-scoring";
import {CriteriaEditor,CriteriaSummary} from "./criteria-ui";
import {readCriteria} from "./criteria";
import { useState } from "react";
import { Database, Plus, Upload, ArrowLeft, Trash2 } from "lucide-react";
import type { Dataset, Field as DatasetField, Row } from "./contracts";
import { clone, publishDataset, uid } from "./domain";
import { mapImport, validateFields } from "./import-data";
import { useWorkbench } from "./provider";
import { ImportDialog } from "./import-dialog";
import {
  Button,
  Empty,
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
  textValue,
} from "./ui";
export function DatasetsPage() {
  const { state, saveDataset } = useWorkbench();
  const [selected, setSelected] = useState<Dataset | null>(null);
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const save = (dataset: Dataset) => saveDataset(dataset);
  if (selected)
    return (
      <DatasetEditor
        key={selected.id}
        initial={selected}
        onSave={save}
        onBack={() => setSelected(null)}
      />
    );
  const usedBy = (id:string) => state.targets.filter(t=>t.evaluation_config?.datasets?.some(d=>d.dataset_id===id));
  const datasets = state.datasets.filter((d) =>
    (!targetFilter || (targetFilter === "__unassigned" ? !usedBy(d.id).length : usedBy(d.id).some(t=>t.id===targetFilter))) &&
    `${d.draft.name} ${d.draft.objective} ${d.draft.tags.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Frame
      title="Datasets"
      description="Reusable evaluation data. Define what to measure, independently of the target you test."
      action={
        <Button
          onClick={() =>
            setSelected({
              id: uid("ds"),
              draft: {
                name: "",
                evaluation_type: "guardrail",
                objective: "",
                description: "",
                tags: [],
                scorerIds: [],
                metadata: {},
                fields: [
                  {
                    name: "input",
                    type: "string",
                    role: "input",
                    required: true,
                    description: "Test input",
                  },
                  {
                    name: "label",
                    type: "string",
                    role: "reference",
                    required: true,
                    description: "Expected classification",
                  },
                  {
                    name: "strategy",
                    type: "string",
                    role: "metadata",
                    required: true,
                    description: "Test strategy",
                  },
                ],
                rows: [],
              },
              versions: [],
            })
          }
        >
          <Plus />
          New dataset
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Search datasets"
        placeholder="Search name, objective or tags…"
        className="max-w-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select aria-label="Filter by evaluation" className="w-64" value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
        <option value="">All evaluations</option>
        <option value="__unassigned">Not used by an evaluation</option>
        {state.targets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
      <span className="text-xs text-muted-foreground">{datasets.length} datasets</span>
      </div>
      {datasets.length ? (
        <Table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Purpose & acceptance criteria</th>
              <th>Draft records</th>
              <th>Published</th>
              <th>Used by evaluations</th>
              <th>Tags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Database className="size-5 text-primary" />
                    <div>
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => setSelected(clone(d))}
                      >
                        {d.draft.name}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.id}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="max-w-sm"><p className="font-medium">{d.draft.objective}</p><p className="text-xs text-muted-foreground">{d.draft.evaluation_type==='guardrail'?'Guardrail classification':'Generic'}</p></td>
                <td>{d.draft.rows.length}</td>
                <td>
                  <Pill>
                    {d.versions.length
                      ? `v${d.versions.at(-1)!.version}`
                      : "Draft only"}
                  </Pill>
                </td>
                <td><div className="flex flex-wrap gap-1">{usedBy(d.id).map(t=><Pill key={t.id}>{t.name}</Pill>)}{!usedBy(d.id).length&&'—'}</div></td>
                <td><TagBadges tags={d.draft.tags}/></td>
                <td>
                  <Button variant="ghost" onClick={() => setSelected(clone(d))}>
                    Manage
                  </Button><DeleteResource collection="datasets" id={d.id} name={d.draft.name}/>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>
          No datasets found. Create a dataset to define your first evaluation
          cases.
        </Empty>
      )}
    </Frame>
  );
}
function DatasetEditor({
  initial,
  onSave,
  onBack,
}: {
  initial: Dataset;
  onSave(d: Dataset): Promise<Dataset>;
  onBack(): void;
}) {
  const { state } = useWorkbench();
  const [dataset, setDataset] = useState(() => clone(initial));
  const [tab, setTab] = useState("Configuration");
  const [tagsText, setTagsText] = useState("");
  const [metadata, setMetadata] = useState(
    JSON.stringify(initial.draft.metadata, null, 2),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<{ index: number; raw: string } | null>(
    null,
  );
  const [rowError, setRowError] = useState("");
  const d = dataset.draft;
  const update = (patch: Partial<Dataset["draft"]>) => {
    setDataset((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
    }));
    setNotice("Unsaved draft changes");
  };
  const save = async (publish: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(metadata);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Metadata must be a JSON object.");
      if (!d.name.trim()) throw new Error("Name is required.");
      validateFields(d.fields);
      parsed.evaluation??={};parsed.evaluation.scorers??={};
      for(const id of d.scorerIds??[]) {
        const version=state.scorers.find(s=>s.id===id)?.versions.at(-1);
        if(version&&!parsed.evaluation.scorers[id]?.version)parsed.evaluation.scorers[id]={version:String(version.version),threshold:version.threshold};
      }
      let next = {
        ...dataset,
        draft: { ...d, name: d.name.trim(), metadata: parsed, tags: Array.from(new Set([...d.tags, ...tagsText.split(",").map((tag) => tag.trim()).filter(Boolean)])) },
      };
      if (publish) next = publishDataset(next);
      const saved = await onSave(next);
      setDataset(saved);
      setTagsText("");
      setError("");
      setNotice(
        publish
          ? `Published v${next.versions.length}. Ready to use in Eval.`
          : "Draft saved to the backend.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const changeField = (index: number, patch: Partial<DatasetField>) =>
    update({
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  return (
    <Frame
      title={d.name || "New dataset"}
      description="Draft changes never modify published versions or historical reports."
      action={
        <div className="flex gap-2">
          <Button disabled={saving} variant="outline" onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button disabled={saving} onClick={() => void save(true)}>Publish version</Button>
        </div>
      }
    >
      <Button variant="ghost" className="w-fit" onClick={onBack}>
        <ArrowLeft />
        All datasets
      </Button>
      <ErrorText message={error} />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <Tabs
        items={[
          "Configuration",
          "Data & fields",
          `Versions (${dataset.versions.length})`,
        ]}
        active={
          tab.startsWith("Data")
            ? "Data & fields"
            : tab.startsWith("Versions")
              ? `Versions (${dataset.versions.length})`
              : tab
        }
        onChange={setTab}
      />
      {tab === "Configuration" && (
        <div className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="Name *">
            <Input
              value={d.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">Evaluation type</span>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
              {d.evaluation_type === "guardrail" ? "Guardrail classification" : "Generic"}
            </div>
          </div>
          <Field label="Dataset objective">
            <Textarea
              rows={2}
              className="min-h-14"
              value={d.objective}
              onChange={(e) => update({ objective: e.target.value })}
            />
          </Field>
          <Field label="Tags" hint="Press Enter or comma to add tags.">
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-primary/30">
              <TagBadges tags={d.tags} onRemove={(tag) => update({tags: d.tags.filter(t => t !== tag)})} />
              <input aria-label="Add tag" className="min-w-24 flex-1 bg-transparent text-sm outline-none" placeholder="Add tag…" value={tagsText}
                onChange={e => {setTagsText(e.target.value); setNotice("Unsaved draft changes");}}
                onKeyDown={e => {if (e.key === "Enter" || e.key === ",") {e.preventDefault(); update({tags: Array.from(new Set([...d.tags, ...tagsText.split(",").map(t => t.trim()).filter(Boolean)]))}); setTagsText("");}}}
                onBlur={() => {if(tagsText.trim()) {update({tags: Array.from(new Set([...d.tags, ...tagsText.split(",").map(t => t.trim()).filter(Boolean)]))}); setTagsText("");}}}
              />
            </div>
          </Field>
          <details className="rounded-md border px-3 py-2 sm:col-span-2">
            <summary className="cursor-pointer text-xs font-medium">Description & advanced metadata</summary>
            <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
              <Field label="Description">
                <Textarea
                  className="min-h-20"
                  value={d.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </Field>
              <Field label="Custom metadata (JSON object)">
                <Textarea
                  className="min-h-20 font-mono text-xs"
                  value={metadata}
                  onChange={(e) => {
                    setMetadata(e.target.value);
                    setNotice("Unsaved draft changes");
                  }}
                />
              </Field>
            </div>
          </details>
        </div>
      )}
      {tab === "Data & fields" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fields define the import schema. Renaming a field does not rewrite
            existing records; validate data before publishing.
          </p>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Required</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.fields.map((f, index) => (
                <tr key={index}>
                  <td>
                    <Input
                      aria-label={`Field ${index + 1} name`}
                      value={f.name}
                      onChange={(e) =>
                        changeField(index, { name: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={`Field ${index + 1} type`}
                      value={f.type}
                      onChange={(e) =>
                        changeField(index, {
                          type: e.target.value as DatasetField["type"],
                        })
                      }
                    >
                      {["string", "number", "boolean", "json"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Select
                      aria-label={`Field ${index + 1} purpose`}
                      value={f.role}
                      onChange={(e) =>
                        changeField(index, {
                          role: e.target.value as DatasetField["role"],
                        })
                      }
                    >
                      {["input", "reference", "metadata"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <input
                      aria-label={`Field ${index + 1} required`}
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        changeField(index, { required: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Field ${index + 1} description`}
                      value={f.description}
                      onChange={(e) =>
                        changeField(index, { description: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <Button
                      aria-label={`Remove field ${index + 1}`}
                      variant="ghost"
                      onClick={() =>
                        update({
                          fields: d.fields.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button
            variant="outline"
            onClick={() =>
              update({
                fields: [
                  ...d.fields,
                  {
                    name: `field_${d.fields.length + 1}`,
                    type: "string",
                    role: "metadata",
                    required: false,
                    description: "",
                  },
                ],
              })
            }
          >
            <Plus />
            Add field
          </Button>
        </div>
      )}
      {tab.startsWith("Data") && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Draft records · edits are saved with the dataset draft
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRowError("");
                  setEditRow({
                    index: -1,
                    raw: JSON.stringify(
                      Object.fromEntries(
                        d.fields.map((f) => [
                          f.name,
                          f.type === "number"
                            ? 0
                            : f.type === "boolean"
                              ? false
                              : f.type === "json"
                                ? {}
                                : "",
                        ]),
                      ),
                      null,
                      2,
                    ),
                  });
                }}
              >
                <Plus />
                Add record
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload />
                Import data
              </Button>
            </div>
          </div>
          {d.rows.length ? (
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  {d.fields.map((f, i) => (
                    <th key={i}>{f.name}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    {d.fields.map((f, i) => (
                      <td key={i} className="max-w-xs">
                        <div className="line-clamp-3 break-words">
                          {textValue(row[f.name])}
                        </div>
                      </td>
                    ))}
                    <td>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRowError("");
                            setEditRow({
                              index,
                              raw: JSON.stringify(row, null, 2),
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Delete record ${index + 1}`}
                          onClick={() =>
                            update({
                              rows: d.rows.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>Add a record or import a CSV, JSON or JSONL file.</Empty>
          )}
        </div>
      )}
      {tab.startsWith("Versions") && (
        <div className="space-y-4">
          {!dataset.versions.length && (
            <Empty>
              No published versions. Add records and publish to make this
              dataset available in Eval.
            </Empty>
          )}
          {dataset.versions.toReversed().map((v) => (
            <details key={v.version} className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                v{v.version} · {v.rows.length} records · {v.fields.length}{" "}
                fields · {new Date(v.publishedAt).toLocaleString()}
              </summary>
              <div className="mt-4">
                <JsonPreview value={v} />
              </div>
            </details>
          ))}
        </div>
      )}
      {importOpen && (
        <ImportDialog
          fields={d.fields}
          onClose={() => setImportOpen(false)}
          onImport={(rows) => update({ rows: [...d.rows, ...rows] })}
        />
      )}
      {editRow && (
        <Modal
          title={editRow.index < 0 ? "Add record" : "Edit record"}
          description="Values must match the dataset field definitions."
          onClose={() => setEditRow(null)}
        >
          <Textarea
            aria-label="Record JSON"
            className="min-h-60 font-mono text-xs"
            value={editRow.raw}
            onChange={(e) => setEditRow({ ...editRow, raw: e.target.value })}
          />
          <ErrorText message={rowError} />
          <Button
            onClick={() => {
              try {
                const parsed: unknown = JSON.parse(editRow.raw);
                if (
                  !parsed ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed)
                )
                  throw new Error("Record must be a JSON object.");
                const row = mapImport(
                  [parsed as Row],
                  d.fields,
                  Object.fromEntries(d.fields.map((f) => [f.name, f.name])),
                )[0]!;
                update({
                  rows:
                    editRow.index < 0
                      ? [...d.rows, row]
                      : d.rows.map((r, i) => (i === editRow.index ? row : r)),
                });
                setEditRow(null);
              } catch (e) {
                setRowError((e as Error).message);
              }
            }}
          >
            Apply record
          </Button>
        </Modal>
      )}
    </Frame>
  );
}

function TagBadges({tags, onRemove}: {tags: string[]; onRemove?: (tag: string) => void}) {
  return <div className="flex flex-wrap gap-1.5">{Array.from(new Set(tags.filter(Boolean))).map(tag => <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs text-primary"><span className="break-all">{tag}</span>{onRemove && <button type="button" aria-label={`Remove tag ${tag}`} className="rounded px-1 hover:bg-primary/15 focus-visible:outline focus-visible:outline-2" onClick={() => onRemove(tag)}>×</button>}</span>)}</div>;
}
