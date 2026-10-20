/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider, useWorkbench } from "./provider";
import { DatasetsPage } from "./datasets-page";
import { EnvironmentsPage } from "./environments-page";
import { ScorersPage } from "./scorers-page";
import { CreateEvalDialog } from "./eval-page";
import { ReportsPage } from "./reports-page";
vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));
const binding = {target_id: "guardrail-privacy", dataset_id: "ds-guardrail", dataset_version: 1, environment_id: "env-isolated", model_id: "glm-dev", langfuse_dataset_id: "real-dataset"};
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (_url.endsWith("/config")) return Response.json({bindings: [binding]});
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      return Response.json({...body, id: "eval-live-test", created_at: new Date().toISOString(), status: "RUNNING", experiment_id: "exp-live-test", completed: 0, phase: "QUEUED"});
    }
    return Response.json({items: []});
  }));
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function StateProbe() {
  const { state } = useWorkbench();
  return <output data-testid="state">{JSON.stringify(state)}</output>;
}
function readState() {
  return JSON.parse(screen.getByTestId("state").textContent!);
}

describe("interactive workbench", () => {
  it("runs the selected Guardrail directly and opens its live report", async () => {
    const user = userEvent.setup();
    function Flow() {
      const [id, setId] = useState("");
      return id ? <ReportsPage evaluationId={id} onSelect={setId} /> : <CreateEvalDialog targetId="guardrail-privacy" onStarted={setId} onClose={() => {}} />;
    }
    render(<WorkbenchProvider><Flow /></WorkbenchProvider>);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByLabelText("Test target *")).toBeNull();
    expect(screen.queryByRole("region", { name: "Target details" })).toBeNull();
    expect(await screen.findByText(/Model: glm-dev/)).toBeTruthy();
    await user.type(screen.getByLabelText("Evaluation name *"), "Inline safety check");
    expect(screen.getByLabelText("Scoring mode").textContent).toContain("Mock score");
    expect(screen.queryByRole("button", { name: "Review evaluation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Run evaluation" }));
    expect(await screen.findByRole("heading", { name: "Inline safety check" })).toBeTruthy();
    expect(screen.getByText("Evaluation in progress")).toBeTruthy();
    expect(screen.getByText(/Scores are development mocks/)).toBeTruthy();
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(call[1]!.body as string);
    expect(body.scorer_ids).toEqual(["mock-score"]);
    expect(body.model_id).toBe("glm-dev");
    expect(body.dataset_id).toBe("ds-guardrail");
    expect(body.snapshot.target.id).toBe("guardrail-privacy");
  });
  it("saves dataset scorer choices and exposes reverse links without rewriting versions", async () => {
    const user = userEvent.setup();
    function Pages() {
      const [page, setPage] = useState("datasets");
      return <>
        <button onClick={() => setPage("scorers")}>Show scorer catalog</button>
        {page === "datasets" ? <DatasetsPage /> : <ScorersPage />}
        <StateProbe />
      </>;
    }
    render(<WorkbenchProvider><Pages /></WorkbenchProvider>);
    await user.click(screen.getByRole("button", { name: "Guardrail conversation safety" }));
    await user.click(screen.getByRole("tab", { name: "Scorers" }));
    await user.click(screen.getByRole("checkbox", { name: /Risk classification/ }));
    await user.click(screen.getByRole("button", { name: "Publish version" }));
    expect(readState().datasets[0].versions[1].scorerIds).toEqual(["sc-safety"]);
    await user.click(screen.getByRole("checkbox", { name: /Policy compliance/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(screen.getByRole("button", { name: "Show scorer catalog" }));
    await user.click(screen.getByRole("button", { name: "Policy compliance" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("tab", { name: "Datasets" }));
    expect(dialog.getByText("Guardrail conversation safety")).toBeTruthy();
    expect(dialog.getByText("v1 · v2")).toBeTruthy();
    expect(dialog.queryByText(/Draft ·/)).toBeNull();
  });
  it("creates, imports and publishes an independent dataset", async () => {
    const user = userEvent.setup();
    render(
      <WorkbenchProvider>
        <DatasetsPage />
        <StateProbe />
      </WorkbenchProvider>,
    );
    await user.click(screen.getByRole("button", { name: "New dataset" }));
    await user.type(screen.getByLabelText("Name *"), "Imported dataset");
    await user.type(
      screen.getByLabelText(/Dataset objective/),
      "Check accuracy",
    );
    await user.click(screen.getByRole("tab", { name: "Data (0)" }));
    await user.click(screen.getByRole("button", { name: "Import data" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(
      dialog.getByRole("button", { name: "Read source & map fields" }),
    );
    await user.selectOptions(
      dialog.getByRole("combobox", { name: /input/ }),
      "question",
    );
    await user.selectOptions(
      dialog.getByRole("combobox", { name: /expected/ }),
      "answer",
    );
    await user.click(dialog.getByRole("button", { name: "Validate import" }));
    await user.click(dialog.getByRole("button", { name: "Import 1 records" }));
    await user.click(screen.getByRole("button", { name: "Publish version" }));
    const dataset = readState().datasets.at(-1);
    expect(dataset.draft.objective).toBe("Check accuracy");
    expect(dataset.versions[0].rows[0].input).toBe(
      "How can I reset my password?",
    );
    expect(dataset).not.toHaveProperty("targetId");
  });
  it("validates sandbox resources and creates a new environment version", async () => {
    const user = userEvent.setup();
    render(
      <WorkbenchProvider>
        <EnvironmentsPage />
        <StateProbe />
      </WorkbenchProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Edit configuration" }),
    );
    await user.clear(screen.getByLabelText("CPU cores"));
    await user.type(screen.getByLabelText("CPU cores"), "0");
    await user.click(screen.getByRole("button", { name: "Save v2" }));
    expect(screen.getByRole("alert").textContent).toContain("CPU");
    await user.clear(screen.getByLabelText("CPU cores"));
    await user.type(screen.getByLabelText("CPU cores"), "4");
    await user.click(screen.getByRole("button", { name: "Save v2" }));
    expect(
      readState().environments[0].versions.map((v: { cpu: number }) => v.cpu),
    ).toEqual([2, 4]);
  });
  it("publishes an upgraded custom scorer without changing v1", async () => {
    const user = userEvent.setup();
    render(
      <WorkbenchProvider>
        <ScorersPage />
        <StateProbe />
      </WorkbenchProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await user.clear(screen.getByLabelText("Version notes *"));
    await user.type(
      screen.getByLabelText("Version notes *"),
      "Stricter threshold",
    );
    await user.clear(screen.getByLabelText("Pass threshold (0–1)"));
    await user.type(screen.getByLabelText("Pass threshold (0–1)"), "0.9");
    await user.click(screen.getByRole("button", { name: "Publish v2" }));
    expect(
      readState().scorers[2].versions.map(
        (v: { threshold: number }) => v.threshold,
      ),
    ).toEqual([0.8, 0.9]);
  });
  it("shows backend failures without creating a simulated evaluation", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (_url.endsWith("/config")) return Response.json({bindings: [binding]});
      if (init?.method === "POST") return Response.json({detail: "Kubernetes is unavailable"}, {status: 502});
      return Response.json({items: []});
    }));
    render(<WorkbenchProvider><CreateEvalDialog onClose={close} /><StateProbe /></WorkbenchProvider>);
    await user.type(screen.getByLabelText("Evaluation name *"), "Safety check");
    await user.click(screen.getByRole("button", {name: "Run evaluation"}));
    expect((await screen.findByRole("alert")).textContent).toContain("Kubernetes is unavailable");
    expect(readState().evaluations.every((e: {id: string}) => e.id.startsWith("eval-demo"))).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });
  it("filters reports by exact ID and opens per-sample trace feedback", async () => {
    const user = userEvent.setup();
    function Reports() {
      const [id, setId] = useState("");
      return <ReportsPage evaluationId={id} onSelect={setId} />;
    }
    render(
      <WorkbenchProvider>
        <Reports />
      </WorkbenchProvider>,
    );
    await user.type(screen.getByLabelText("Evaluation ID"), "eval-demo-001");
    expect(
      screen.queryByRole("button", { name: "Guardrail risk regression" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Guardrail safety baseline" }),
    );
    expect(
      screen.getByRole("columnheader", { name: "Conversation (messages)" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Expected has_issue" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Detected has_issue" }),
    ).not.toBeNull();
    expect(screen.queryByRole("tab", { name: "Configuration" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /View environment configuration/ }),
    );
    const config = within(screen.getByRole("dialog"));
    expect(config.getByText("demo-model-support")).not.toBeNull();
    expect(config.getByText("guardrail-privacy")).not.toBeNull();
    expect(config.getByText("OpenShell")).not.toBeNull();
    expect(config.getByText("Runner configuration")).not.toBeNull();
    await user.click(config.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: "#1" }));
    expect(
      screen.getByRole("heading", { name: "Sample trace & feedback" }),
    ).not.toBeNull();
    expect(screen.getByText("LLM proxy")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Scorer feedback" }),
    ).not.toBeNull();
  });
});

it("creates a custom scorer from a Git repository and relative script path", async () => {
  const user = userEvent.setup();
  render(
    <WorkbenchProvider>
      <ScorersPage />
      <StateProbe />
    </WorkbenchProvider>,
  );
  await user.click(screen.getByRole("button", { name: "New scorer" }));
  await user.type(screen.getByLabelText("Name *"), "Git risk scorer");
  await user.type(
    screen.getByLabelText("Git repository *"),
    "https://github.com/example/scorers.git",
  );
  await user.type(
    screen.getByLabelText("Script path *"),
    "scorers/guardrail.py",
  );
  await user.type(screen.getByLabelText("Version notes *"), "Initial script");
  await user.click(screen.getByRole("button", { name: "Publish v1" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(readState().scorers.at(-1).versions[0]).toMatchObject({
    kind: "CODE",
    repoUrl: "https://github.com/example/scorers.git",
    scriptPath: "scorers/guardrail.py",
  });
});
