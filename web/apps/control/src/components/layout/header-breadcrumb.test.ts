import { describe, expect, it } from "vitest";
import { getHeaderBreadcrumbItems } from "./header-breadcrumb";

describe("getHeaderBreadcrumbItems", () => {
  it("keeps Cost as a top-level Project destination", () => {
    expect(getHeaderBreadcrumbItems("/individual/cost")).toEqual([
      { href: "/individual/cost", label: "Cost" },
    ]);
  });

  it("labels the OpenClaw Memory destination", () => {
    expect(getHeaderBreadcrumbItems("/individual/memory")).toEqual([
      { href: "/individual/memory", label: "Memory" },
    ]);
  });

  it("keeps the current resource identity for dynamic routes", () => {
    expect(getHeaderBreadcrumbItems("/web3/instances/devops")).toEqual([
      { href: "/web3/instances", label: "Instances" },
      { href: "/web3/instances/devops", label: "devops" },
    ]);
  });

  it("uses canonical request language", () => {
    expect(getHeaderBreadcrumbItems("/individual/requests/new")).toEqual([
      { href: "/individual/requests", label: "Requests" },
      { href: "/individual/requests/new", label: "Raise Request" },
    ]);
  });

  it("distinguishes My Account from Project settings", () => {
    expect(getHeaderBreadcrumbItems("/individual/profile")).toEqual([
      { href: "/individual/profile", label: "My Account" },
    ]);
    expect(getHeaderBreadcrumbItems("/individual/setting")).toEqual([
      { href: "/individual/setting", label: "Project Settings" },
    ]);
  });

  it("uses the canonical label for Project audit logs", () => {
    expect(getHeaderBreadcrumbItems("/individual/audit-logs")).toEqual([
      { href: "/individual/audit-logs", label: "Audit Logs" },
    ]);
  });

  it("uses a stable label for Agent marketplace details", () => {
    expect(
      getHeaderBreadcrumbItems(
        "/individual/agent-garden/adk-customer-service",
      ),
    ).toEqual([
      {
        href: "/individual/agent-garden",
        label: "Agent Garden",
      },
      {
        href: "/individual/agent-garden/adk-customer-service",
        label: "Agent details",
      },
    ]);
  });

  it("labels Evaluation deep links", () => {
    expect(
      getHeaderBreadcrumbItems(
        "/individual/evaluations/reports/report-1",
      ),
    ).toEqual([
      { href: "/individual/evaluations", label: "Evaluations" },
      { href: "/individual/evaluations/reports", label: "Reports" },
      {
        href: "/individual/evaluations/reports/report-1",
        label: "Report detail",
      },
    ]);
  });

  it("labels the isolated Evaluation layer and its detail routes", () => {
    expect(
      getHeaderBreadcrumbItems("/individual/evaluation/catalog"),
    ).toEqual([
      { href: "/individual/evaluation", label: "Evaluation" },
      { href: "/individual/evaluation/catalog", label: "Evaluation" },
    ]);
    expect(
      getHeaderBreadcrumbItems(
        "/individual/evaluation/targets/demo-permission-compliance",
      ),
    ).toEqual([
      { href: "/individual/evaluation", label: "Evaluation" },
      { href: "/individual/evaluation/targets", label: "Agent" },
      {
        href: "/individual/evaluation/targets/demo-permission-compliance",
        label: "Agent detail",
      },
    ]);
    expect(
      getHeaderBreadcrumbItems(
        "/individual/evaluation/datasets/permission-compliance-regression",
      ),
    ).toEqual([
      { href: "/individual/evaluation", label: "Evaluation" },
      { href: "/individual/evaluation/datasets", label: "Datasets" },
      {
        href: "/individual/evaluation/datasets/permission-compliance-regression",
        label: "Test Case detail",
      },
    ]);
  });
});
