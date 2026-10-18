import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@/types/project";
import { itemIsActive, navItemVisibleForRole, projectNavGroups } from "./app-shell";

function visibleLabels(groupLabel: string, role: ProjectRole) {
  return projectNavGroups
    .find((group) => group.label === groupLabel)!
    .items.filter((item) => navItemVisibleForRole(item, role))
    .map((item) => item.label);
}

describe("Evaluation navigation", () => {
  it("groups evaluation resources under Evaluation and places Dashboard first in Observer", () => {
    expect(
      projectNavGroups
        .find((group) => group.label === "Evaluation")
        ?.items.map((item) => item.label),
    ).toEqual(["Eval", "Datasets", "Environments", "Scorers", "Reports"]);
    expect(
      projectNavGroups
        .find((group) => group.label === "Observer")
        ?.items.map((item) => item.label),
    ).toEqual(["Dashboard", "Traces", "Cost"]);
  });

  it("keeps the Eval active state scoped to the catalog", () => {
    const group = projectNavGroups.find((item) => item.label === "Evaluation")!;
    const catalog = group.items[0]!;
    expect(itemIsActive(catalog, "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(catalog, "/individual/evaluation/targets/demo", "individual")).toBe(false);
  });
});

describe("Role-based navigation whitelist", () => {
  it("shows every item to admin", () => {
    for (const group of projectNavGroups) {
      expect(visibleLabels(group.label, "admin")).toEqual(
        group.items.map((item) => item.label),
      );
    }
  });

  it("shows member everything except admin-only Guardrails", () => {
    for (const group of projectNavGroups) {
      expect(visibleLabels(group.label, "member")).toEqual(
        group.items.filter((item) => item.label !== "Guardrails").map((item) => item.label),
      );
    }
  });

  it("restricts compliance to policy, behavior, and traceability surfaces", () => {
    expect(visibleLabels("Agentic", "compliance")).toEqual([]);
    expect(visibleLabels("Evaluation", "compliance")).toEqual([]);
    expect(visibleLabels("Security", "compliance")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "compliance")).toEqual([
      "Dashboard",
      "Traces",
    ]);
  });

  it("gives ADA and ISS risk-assessment, behavior, and traceability surfaces", () => {
    for (const role of ["ada", "iss"] as const) {
      expect(visibleLabels("Agentic", role)).toEqual(["Skills", "MCP Servers"]);
      expect(visibleLabels("Evaluation", role)).toEqual(["Eval", "Datasets", "Environments", "Scorers", "Reports"]);
      expect(visibleLabels("Security", role)).toEqual(["Audit Logs"]);
      expect(visibleLabels("Observer", role)).toEqual(["Dashboard", "Traces"]);
    }
  });

  it("gives FRT everything except policy compliance and admin-only surfaces", () => {
    expect(visibleLabels("Agentic", "frt")).toEqual([
      "Agent Garden",
      "Instances",
      "Skills",
      "MCP Servers",
      "Knowledge Base",
      "Memory",
    ]);
    expect(visibleLabels("Evaluation", "frt")).toEqual(["Eval", "Datasets", "Environments", "Scorers", "Reports"]);
    expect(visibleLabels("Security", "frt")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "frt")).toEqual(["Dashboard", "Traces"]);
  });
});
