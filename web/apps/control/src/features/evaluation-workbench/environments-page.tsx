import { useState } from "react";
import { Plus, ShieldCheck, Network, FolderLock, Terminal } from "lucide-react";
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
  Section,
  Select,
  Textarea,
} from "./ui";
export const defaultEnvironment: EnvironmentConfig = {
  name: "",
  description: "",
  type: "SANDBOX",
  modelId: "glm-dev",
  guardrailId: "guardrail-privacy",
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
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-medium">Evaluation-managed traffic</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            LLM and Guardrail requests are designed to be intercepted and routed
            through the evaluation proxy for recording and controlled
            evaluation. CPU and memory are applied to the evaluation worker as both
            requests and limits. Environment versions are saved to the backend; other sandbox
            restrictions remain a configuration preview.
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {state.environments.map((env) => {
          const v = env.versions.at(-1)!;
          return (
            <Section
              key={env.id}
              title={v.name}
              description={v.description}
              action={<Pill>Sandbox · v{v.version}</Pill>}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
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
                </div>
                <div className="space-y-2 border-y py-4 text-sm">
                  <p className="flex items-center gap-2">
                    <Network className="size-4 text-muted-foreground" />
                    {v.network.length
                      ? `${v.network.length} allowed network hosts`
                      : "Network denied by default"}
                  </p>
                  <p className="flex items-center gap-2">
                    <FolderLock className="size-4 text-muted-foreground" />
                    {v.readOnlyPaths.length} read-only ·{" "}
                    {v.writablePaths.length} writable paths
                  </p>
                  <p className="flex items-center gap-2">
                    <Terminal className="size-4 text-muted-foreground" />
                    {v.commands.join(", ") || "No process commands allowed"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Pill>LLM proxy</Pill>
                  <Pill>Guardrail proxy</Pill>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setHistory(env)}>
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
            </Section>
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
              <JsonPreview value={v} />
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
    const value = clone(initial.versions.at(-1) ?? defaultEnvironment);
    return { ...value, runner: { ...value.runner, id: "openshell" } };
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const patch = (value: Partial<EnvironmentConfig>) =>
    setConfig((c) => ({ ...c, ...value }));
  const list = (
    key: "network" | "readOnlyPaths" | "writablePaths" | "commands",
    label: string,
    hint: string,
  ) => (
    <Field label={label} hint={hint}>
      <Textarea
        value={config[key].join("\n")}
        onChange={(e) => patch({ [key]: e.target.value.split("\n") })}
      />
    </Field>
  );
  return (
    <Modal
      title={
        initial.versions.length
          ? "Edit sandbox configuration"
          : "New sandbox configuration"
      }
      description="Saving persists a new immutable version. CPU and memory apply to new evaluation Pods; other sandbox settings are previews."
      onClose={onClose}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Configuration name *">
          <Input
            value={config.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="Environment type">
          <Input value="Sandbox" disabled />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea
              value={config.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label="Model ID"
          hint="glm-dev 调用模型；none 跳过模型，将 dataset input 直接交给打分器，模型耗时为 0。"
        >
          <Select
            value={config.modelId ?? "glm-dev"}
            onChange={(e) => patch({ modelId: e.target.value })}
          >
            {config.modelId && !["glm-dev", "none"].includes(config.modelId) && (
              <option value={config.modelId} disabled>{config.modelId} (legacy)</option>
            )}
            <option value="glm-dev">glm-dev</option>
            <option value="none">none</option>
          </Select>
        </Field>
        <Field label="Guardrail ID">
          <Input
            value={config.guardrailId ?? ""}
            onChange={(e) => patch({ guardrailId: e.target.value })}
          />
        </Field>
        <Field label="执行环境">
          <Input value="OpenShell" disabled />
        </Field>
        <Field label="Runner concurrency">
          <Input
            type="number"
            min={1}
            max={32}
            value={
              Number.isFinite(config.runner?.concurrency)
                ? config.runner.concurrency
                : ""
            }
            onChange={(e) =>
              patch({
                runner: {
                  ...(config.runner ?? { id: "" }),
                  concurrency: e.target.valueAsNumber,
                },
              })
            }
          />
        </Field>
        {list(
          "network",
          "Network allowlist",
          "One hostname per line. Empty means deny all direct egress; managed proxies are separate.",
        )}
        {list(
          "commands",
          "Allowed process commands",
          "One executable per line. Empty means no process commands.",
        )}
        {list(
          "readOnlyPaths",
          "Read-only paths",
          "Absolute paths, one per line.",
        )}
        {list(
          "writablePaths",
          "Writable paths",
          "Absolute paths, one per line.",
        )}
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          {(
            [
              ["cpuMillicores", "CPU (m)", 1, 32000],
              ["memoryMiB", "Memory (Mi)", 128, 65536],
              ["timeoutSeconds", "Timeout (seconds)", 1, 3600],
            ] as const
          ).map(([key, label, min, max]) => (
            <Field key={key} label={label} hint={key === "cpuMillicores" ? "1000m = 1 CPU core. Requests and limits use this value." : key === "memoryMiB" ? "1024Mi = 1Gi. Requests and limits use this value." : ""}>
              <Input
                type="number"
                min={min}
                step={1}
                max={max}
                value={Number.isFinite(config[key]) ? config[key] : ""}
                onChange={(e) => patch({ [key]: e.target.valueAsNumber })}
              />
            </Field>
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Required evaluation interception</p>
        <p className="mt-2 text-muted-foreground">
          LLM access: evaluation proxy · Guardrail access: evaluation proxy
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          These settings are configuration placeholders. Live runs use the
          backend-managed proxy configuration.
        </p>
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
              const clean = {
                ...config,
                ...Object.fromEntries(
                  (
                    [
                      "network",
                      "commands",
                      "readOnlyPaths",
                      "writablePaths",
                    ] as const
                  ).map((key) => [
                    key,
                    config[key].map((v) => v.trim()).filter(Boolean),
                  ]),
                ),
              };
              validateEnvironment(clean);
              await onSave({
                ...initial,
                versions: [
                  ...initial.versions,
                  {
                    ...clean,
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
