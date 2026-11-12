import {DeleteResource} from './delete-resource';
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Environment, EnvironmentConfig } from "./contracts";
import { clone, uid, validateEnvironment } from "./domain";
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
  Textarea,
} from "./ui";
export const defaultEnvironment: EnvironmentConfig = {
  name: "",
  description: "",
  type: "SANDBOX",
  modelId: "none",
  guardrailId: "none",
  runner: { id: "openshell", concurrency: 1 },
  network: [],
  readOnlyPaths: ["/app", "/datasets"],
  writablePaths: ["/workspace", "/tmp"],
  commands: ["python"],
  cpuMillicores: 2000,
  memoryMiB: 2048,
  timeoutSeconds: 120,
  interceptLlm: true,
  interceptGuardrail: true,
};
export function EnvironmentsPage() {
  const { state, saveEnvironment } = useWorkbench();
  const [editing, setEditing] = useState<Environment | null>(null);
  const [history, setHistory] = useState<Environment | null>(null);
  return (
    <Frame
      title="Environments"
      description="Versioned sandbox profiles for repeatable, controlled evaluations."
      action={
        <Button onClick={() => setEditing({ id: uid("env"), versions: [] })}>
          <Plus />
          New configuration
        </Button>
      }
    >
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {state.environments.map((env) => {
          const v = env.versions.at(-1)!;
          return (
            <article key={env.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
              <header className="border-b px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 truncate text-sm font-semibold" title={v.name}>{v.name}</h2>
                  <span className="shrink-0"><Pill>Sandbox · v{v.version}</Pill></span>
                </div>
                <p className="mt-1 line-clamp-2 h-10 text-xs leading-5 text-muted-foreground" title={v.description}>{v.description || "No description"}</p>
              </header>
              <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">CPU</p>
                    <p className="mt-1 font-medium">{v.cpuMillicores}m</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Memory</p>
                    <p className="mt-1 font-medium">{v.memoryMiB}Mi</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Timeout</p>
                    <p className="mt-1 font-medium">{v.timeoutSeconds}s</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Default case concurrency</p>
                    <p className="mt-1 font-medium">{v.runner?.concurrency ?? 1}</p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap justify-end gap-1 border-t pt-2">
                  <DeleteResource collection="environments" id={env.id} name={v.name}/><Button variant="ghost" onClick={() => setHistory(env)}>
                    Versions
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(clone(env))}
                  >
                    Edit configuration
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <EnvironmentEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (env) => {
            await saveEnvironment(env);
            setEditing(null);
          }}
        />
      )}
      {history && (
        <Modal
          title="Environment versions"
          description="Each evaluation retains the configuration version selected at launch."
          onClose={() => setHistory(null)}
        >
          {history.versions.toReversed().map((v) => (
            <details key={v.version} className="rounded-md border p-3">
              <summary className="cursor-pointer">
                v{v.version} · {new Date(v.publishedAt).toLocaleString()}
              </summary>
              <JsonPreview value={{name:v.name, description:v.description, cpuMillicores:v.cpuMillicores, memoryMiB:v.memoryMiB, timeoutSeconds:v.timeoutSeconds, defaultCaseConcurrency:v.runner?.concurrency ?? 1}} />
            </details>
          ))}
        </Modal>
      )}
    </Frame>
  );
}
function EnvironmentEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Environment;
  onSave(e: Environment): Promise<void>;
  onClose(): void;
}) {
  const [config, setConfig] = useState<EnvironmentConfig>(() => {
    const value = initial.versions.at(-1) ?? defaultEnvironment;
    return {
      ...clone(defaultEnvironment),
      name: value.name,
      description: value.description,
      cpuMillicores: value.cpuMillicores,
      memoryMiB: value.memoryMiB,
      timeoutSeconds: value.timeoutSeconds,
      runner: { ...defaultEnvironment.runner, concurrency: value.runner?.concurrency ?? 1 },
    };
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const patch = (value: Partial<EnvironmentConfig>) =>
    setConfig((c) => ({ ...c, ...value }));
  return (
    <Modal
      title={
        initial.versions.length
          ? "Edit sandbox configuration"
          : "New sandbox configuration"
      }
      description="Saving creates a new environment version."
      onClose={onClose}
    >
      <div className="grid gap-3">
        <Field label="Configuration name *">
          <Input value={config.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            className="min-h-14"
            value={config.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          {([
            ["cpuMillicores", "CPU (m)", 1, 32000],
            ["memoryMiB", "Memory (Mi)", 128, 65536],
            ["timeoutSeconds", "Timeout (seconds)", 1, 3600],
          ] as const).map(([key, label, min, max]) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                min={min}
                max={max}
                value={Number.isFinite(config[key]) ? config[key] : ""}
                onChange={(e) => patch({ [key]: e.target.valueAsNumber })}
              />
            </Field>
          ))}
          <Field label="Default case concurrency">
            <Input
              type="number"
              min={1}
              max={32}
              value={Number.isFinite(config.runner.concurrency) ? config.runner.concurrency : ""}
              onChange={(e) => patch({ runner: { ...config.runner, concurrency: e.target.valueAsNumber } })}
            />
          </Field>
        </div>
      </div>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              validateEnvironment(config);
              await onSave({
                ...initial,
                versions: [
                  ...initial.versions,
                  {
                    ...config,
                    version: initial.versions.length + 1,
                    publishedAt: new Date().toISOString(),
                  },
                ],
              });
            } catch (e) {
              setError((e as Error).message);
            } finally { setSaving(false); }
          }}
        >
          Save v{initial.versions.length + 1}
        </Button>
      </div>
    </Modal>
  );
}
