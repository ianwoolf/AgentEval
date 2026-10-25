import { useState, type ReactNode } from "react";
import { Box, Database, Crosshair, ChevronRight } from "lucide-react";
import type { EvaluationSnapshot } from "./contracts";
import { JsonPreview, Modal, Pill } from "./ui";

function Details({
  title,
  items,
}: {
  title: string;
  items: Array<[string, ReactNode]>;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      <dl className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function ReportConfig({ snapshot }: { snapshot: EvaluationSnapshot }) {
  const [section, setSection] = useState<
    "target" | "environment" | "dataset" | null
  >(null);
  const { target, environment: env, dataset } = snapshot;
  const list = (values: string[]) => values.join(", ") || "None";
  const cards = [
    {
      key: "target" as const,
      icon: Crosshair,
      label: "Target",
      name: target.name,
      detail: `${target.kind} · v${target.version}`,
      extra: target.id,
    },
    {
      key: "environment" as const,
      icon: Box,
      label: "Environment",
      name: env.name,
      detail: `${env.type} · v${env.version}`,
      extra: `Model: ${env.modelId || "Not configured"} · Guardrail: ${env.guardrailId || "Not configured"} · Runner: ${env.runner?.id || "Not configured"}`,
    },
    {
      key: "dataset" as const,
      icon: Database,
      label: "Dataset",
      name: dataset.name,
      detail: `v${dataset.version} · ${dataset.rows.length} cases · ${dataset.fields.length} fields`,
      extra: dataset.objective,
    },
  ];
  return (
    <section aria-label="Evaluation configuration" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Evaluation configuration</h2>
        <span className="text-xs text-muted-foreground">
          Launch snapshot · click to inspect
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            aria-label={`View ${card.key} configuration`}
            onClick={() => setSection(card.key)}
            className="min-w-0 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <card.icon className="size-4" />
              {card.label}
              <ChevronRight className="ml-auto size-4" />
            </span>
            <span
              className="mt-2 block truncate text-sm font-medium"
              title={card.name}
            >
              {card.name}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {card.detail}
            </span>
            <span
              className="mt-2 block line-clamp-2 break-words text-xs text-muted-foreground"
              title={card.extra}
            >
              {card.extra}
            </span>
          </button>
        ))}
      </div>
      {section && (
        <Modal
          title={`${section === "target" ? "Target" : section === "environment" ? "Environment" : "Dataset"} configuration`}
          description="Captured when this evaluation started. Later resource changes do not modify this report. All runtime identifiers are demo configuration."
          onClose={() => setSection(null)}
        >
          {section === "target" && (
            <>
              <Details
                title="Test target"
                items={[
                  ["Name", target.name],
                  ["Target ID", target.id],
                  ["Kind", <Pill key="kind">{target.kind}</Pill>],
                  ["Version", `v${target.version}`],
                ]}
              />
              <section>
                <h3 className="mb-2 font-medium">Definition</h3>
                <p className="whitespace-pre-wrap rounded-lg border p-4 text-sm">
                  {target.definition}
                </p>
              </section>
            </>
          )}
          {section === "environment" && (
            <>
              <Details
                title="Execution environment"
                items={[
                  ["Name", env.name],
                  ["Environment ID", snapshot.environmentId],
                  ["Type / version", `${env.type} · v${env.version}`],
                  ["Model ID", env.modelId || "Not configured"],
                  ["Guardrail ID", env.guardrailId || "Not configured"],
                  ["Description", env.description || "—"],
                ]}
              />
              <Details
                title="Runner configuration"
                items={[
                  ["执行环境", env.runner?.id === "openshell" ? "OpenShell" : env.runner?.id || "Not configured"],
                  ["Concurrency", env.runner?.concurrency ?? "Not configured"],
                  ["CPU / memory", `${env.cpuMillicores}m / ${env.memoryMiB}Mi`],
                  ["Timeout", `${env.timeoutSeconds}s`],
                  ["Allowed commands", list(env.commands)],
                  [
                    "Network allowlist",
                    env.network.length
                      ? list(env.network)
                      : "Deny direct egress",
                  ],
                  ["Read-only paths", list(env.readOnlyPaths)],
                  ["Writable paths", list(env.writablePaths)],
                  [
                    "LLM interception",
                    env.interceptLlm
                      ? "Evaluation proxy (simulated)"
                      : "Not configured",
                  ],
                  [
                    "Guardrail interception",
                    env.interceptGuardrail
                      ? "Evaluation proxy (simulated)"
                      : "Not configured",
                  ],
                ]}
              />
            </>
          )}
          {section === "dataset" && (
            <>
              <Details
                title="Dataset"
                items={[
                  ["Name", dataset.name],
                  ["Dataset ID", snapshot.datasetId],
                  ["Version", `v${dataset.version}`],
                  ["Cases", dataset.rows.length],
                  ["Objective", dataset.objective],
                  ["Description", dataset.description || "—"],
                  ["Tags", list(dataset.tags)],
                  ["Published", new Date(dataset.publishedAt).toLocaleString()],
                ]}
              />
              <section>
                <h3 className="mb-2 font-medium">Field schema</h3>
                <JsonPreview value={dataset.fields} />
              </section>
              <section>
                <h3 className="mb-2 font-medium">Custom metadata</h3>
                <JsonPreview value={dataset.metadata} />
              </section>
            </>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Full evaluation snapshot (including scorers)
            </summary>
            <div className="mt-3">
              <JsonPreview value={snapshot} />
            </div>
          </details>
        </Modal>
      )}
    </section>
  );
}
