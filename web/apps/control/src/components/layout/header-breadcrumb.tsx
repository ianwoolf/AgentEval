import { Fragment } from "react";
import { useProject } from "@/hooks/use-project";
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  "access-policies": "Access Policies",
  "agent-garden": "Agent Garden",
  "audit-logs": "Audit Logs",
  agent: "Agent",
  agents: "Instances",
  cost: "Cost",
  dashboard: "Overview",
  datasets: "Datasets",
  evaluations: "Evaluations",
  evaluation: "Evaluation",
  instances: "Instances",
  instace: "Instances",
  knowledge: "Knowledge Base",
  memory: "Memory",
  mcp: "MCP Servers",
  new: "Create Instance",
  policy: "Policy",
  profile: "My Account",
  "model-routings": "Routing",
  requests: "Requests",
  reports: "Reports",
  runs: "Evaluation",
  security: "Security",
  runtime: "Runtime",
  sandboxes: "Sandboxes",
  setting: "Project Settings",
  settings: "Settings",
  skill: "Skills",
  skills: "Skills",
  tickets: "Ticket List",
  targets: "Targets",
  traces: "Traces",
  projects: "Projects",
};

export interface HeaderBreadcrumbItem {
  href: string;
  label: string;
}

function decodePathPart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function getHeaderBreadcrumbItems(pathname: string): HeaderBreadcrumbItem[] {
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[0];
  return parts.slice(1).flatMap((part, routeIndex) => {
    const index = routeIndex + 1;
    const evaluationDetailLabels: Record<string, string> = {
      targets: "Target detail",
      datasets: "Dataset detail",
      runs: "Evaluation detail",
      reports: "Report detail",
    };
    const evaluationLayerLabels: Record<string, string> = {
      catalog: "Eval",
      targets: "Agent",
      datasets: "Datasets",
      environments: "Environments",
      scorers: "Scorers",
      reports: "Reports",
      runs: "Evaluation",
      overview: "Dashboard",
      traces: "Trace",
      settings: "Settings",
    };
    const label =
      routeIndex === 1 &&
      parts[1] === "evaluation" &&
      evaluationLayerLabels[part]
        ? evaluationLayerLabels[part]!
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "targets"
        ? "Agent detail"
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "datasets"
        ? "Test Case detail"
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "runs" &&
          part !== "new"
        ? "Evaluation detail"
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "traces"
        ? "Trace analysis"
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "reports"
        ? "Report detail"
        : routeIndex === 2 &&
          parts[1] === "evaluation" &&
          parts[2] === "runs" &&
          part === "new"
        ? "New Evaluation"
        :
      routeIndex === 2 &&
      parts[1] === "evaluations" &&
      evaluationDetailLabels[parts[2] ?? ""]
        ? evaluationDetailLabels[parts[2]!]!
        : routeIndex === 1 && parts[1] === "evaluations" && part === "new"
        ? "New Evaluation"
        : routeIndex === 1 && parts[1] === "agent-garden"
        ? "Agent details"
        :
      routeIndex === 1 && parts[1] === "access-policies"
        ? "Policy details"
        :
      routeIndex === 1 && parts[1] === "requests" && part === "new"
        ? "Raise Request"
        : routeLabels[part] ?? decodePathPart(part);
    return [{
      href: `/${[projectId, ...parts.slice(1, index + 1)].join("/")}`,
      label,
    }];
  });
}

export function HeaderBreadcrumb({ pathname }: { pathname: string }) {
  const { currentProject: currentProject } = useProject();
  const items = getHeaderBreadcrumbItems(pathname);
  const lastIndex = items.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
    >
      <span
        className="max-w-36 shrink-0 truncate font-medium text-foreground sm:max-w-48"
        title={currentProject?.name}
      >
        {currentProject?.name ?? "Project"}
      </span>
      {items.map((item, index) => {
        const current = index === lastIndex;
        return (
          <Fragment key={item.href}>
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground/70",
                !current && "hidden md:inline",
              )}
            >
              /
            </span>
            <span
              aria-current={current ? "page" : undefined}
              className={cn(
                "shrink-0",
                current
                  ? "min-w-0 truncate font-medium text-foreground"
                  : "hidden md:inline",
              )}
              title={item.label}
            >
              {item.label}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
