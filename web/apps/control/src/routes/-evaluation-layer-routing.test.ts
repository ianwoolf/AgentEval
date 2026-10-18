import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

function matchRouteIds(pathname: string) {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  return router.matchRoutes(pathname).map((match) => match.routeId);
}

describe("Evaluation layer routes", () => {
  it.each([
    ["/individual/evaluation/environments", "/$projectId/evaluation/environments"],
    ["/individual/evaluation/scorers", "/$projectId/evaluation/scorers"],
    ["/individual/evaluation/reports", "/$projectId/evaluation/reports/"],
    ["/individual/evaluation/catalog", "/$projectId/evaluation/catalog"],
    ["/individual/evaluation/targets", "/$projectId/evaluation/targets/"],
    ["/individual/evaluation/datasets", "/$projectId/evaluation/datasets/"],
    ["/individual/evaluation/runs", "/$projectId/evaluation/runs/"],
    ["/individual/evaluation/overview", "/$projectId/evaluation/overview"],
    ["/individual/evaluation/traces", "/$projectId/evaluation/traces/"],
    ["/individual/evaluation/settings", "/$projectId/evaluation/settings"],
  ])("matches %s inside the isolated layout", (pathname, routeId) => {
    const matches = matchRouteIds(pathname);
    expect(matches).toContain("/$projectId/evaluation");
    expect(matches).toContain(routeId);
  });

  it.each([
    ["/individual/evaluation/targets/demo", "/$projectId/evaluation/targets/$targetId"],
    ["/individual/evaluation/datasets/demo", "/$projectId/evaluation/datasets/$datasetId"],
    ["/individual/evaluation/runs/new", "/$projectId/evaluation/runs/new"],
    ["/individual/evaluation/runs/demo", "/$projectId/evaluation/runs/$runId"],
    ["/individual/evaluation/reports/demo", "/$projectId/evaluation/reports/$reportId"],
    ["/individual/evaluation/traces/demo", "/$projectId/evaluation/traces/$traceId"],
  ])("matches the detail flow %s", (pathname, routeId) => {
    expect(matchRouteIds(pathname)).toContain(routeId);
  });
});
