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
  const datasets = state.datasets.filter((d) =>
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
                    name: "expected",
                    type: "string",
                    role: "reference",
                    required: false,
                    description: "Reference answer",
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
      <Input
        aria-label="Search datasets"
        placeholder="Search name, objective or tags…"
        className="max-w-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {datasets.length ? (
        <Table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Objective</th>
              <th>Draft records</th>
              <th>Published</th>
              <th>Tags</th>
              <th>Selectable scorers</th>
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
                <td className="max-w-sm">{d.draft.objective}</td>
                <td>{d.draft.rows.length}</td>
                <td>
                  <Pill>
                    {d.versions.length
                      ? `v${d.versions.at(-1)!.version}`
                      : "Draft only"}
                  </Pill>
                </td>
                <td>{d.draft.tags.join(", ") || "—"}</td>
                <td>{d.draft.scorerIds?.length
                  ? d.draft.scorerIds.map((id) => state.scorers.find((s) => s.id === id)?.draft.name ?? id).join(", ")
                  : "All scorers"}</td>
                <td>
                  <Button variant="ghost" onClick={() => setSelected(clone(d))}>
                    Manage
                  </Button>
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
  const [tab, setTab] = useState("Overview");
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
      if (!d.name.trim() || !d.objective.trim())
        throw new Error("Name and objective are required.");
      validateFields(d.fields);
      let next = {
        ...dataset,
        draft: { ...d, name: d.name.trim(), metadata: parsed },
      };
      if (publish) next = publishDataset(next);
      const saved = await onSave(next);
      setDataset(saved);
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
          "Overview",
          "Fields",
          "Scorers",
          `Data (${d.rows.length})`,
          `Versions (${dataset.versions.length})`,
        ]}
        active={
          tab.startsWith("Data")
            ? `Data (${d.rows.length})`
            : tab.startsWith("Versions")
              ? `Versions (${dataset.versions.length})`
              : tab
        }
        onChange={setTab}
      />
      {tab === "Overview" && (
        <div className="grid max-w-4xl gap-5 sm:grid-cols-2">
          <Field label="Name *">
            <Input
              value={d.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field label="Tags" hint="Separate tags with commas.">
            <Input
              value={d.tags.join(", ")}
              onChange={(e) =>
                update({ tags: e.target.value.split(",").map((t) => t.trim()) })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Dataset objective *"
              hint="What should this dataset measure? This does not bind the dataset to a target."
            >
              <Textarea
                value={d.objective}
                onChange={(e) => update({ objective: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                value={d.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Custom metadata (JSON object)">
              <Textarea
                className="min-h-32 font-mono text-xs"
                value={metadata}
                onChange={(e) => {
                  setMetadata(e.target.value);
                  setNotice("Unsaved draft changes");
                }}
              />
            </Field>
          </div>
        </div>
      )}
      {tab === "Fields" && (
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
      {tab === "Scorers" && (
        <div className="max-w-4xl space-y-4">
          <p className="text-sm text-muted-foreground">
            A dataset supplies input and reference values; the target generates output, and a scorer evaluates output against reference. Choose compatible scorers for this dataset. Leave all unchecked to allow all scorers.
            Save the draft, then publish a version to use these choices in Eval.
            Associations do not execute scorers. Actual runs use the scorer configured in the target Config and installed in the backend.
          </p>
          {state.scorers.map((scorer) => (
            <label key={scorer.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={d.scorerIds?.includes(scorer.id) ?? false}
                onChange={(e) => update({ scorerIds: e.target.checked
                  ? [...(d.scorerIds ?? []), scorer.id]
                  : (d.scorerIds ?? []).filter((id) => id !== scorer.id) })}
              />
              <span className="flex-1">
                <span className="font-medium">{scorer.draft.name}</span>
                <span className="mt-1 block text-muted-foreground">{scorer.draft.description}</span>
              </span>
              <Pill>{!scorer.enabled ? "Disabled" : scorer.versions.length ? `v${scorer.versions.at(-1)!.version}` : "Draft only"}</Pill>
            </label>
          ))}
          {!state.scorers.length && <Empty>Create a scorer in Scorers to configure this dataset.</Empty>}
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
