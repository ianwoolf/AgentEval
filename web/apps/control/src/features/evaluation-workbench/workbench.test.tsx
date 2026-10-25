/** @vitest-environment jsdom */
import { createFixtures } from "./domain";
import { useState } from "react";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider, useWorkbench } from "./provider";
import { DatasetsPage } from "./datasets-page";
import { EnvironmentsPage } from "./environments-page";
import { ScorersPage } from "./scorers-page";
import { TriggerTargetDialog } from "./trigger-target";
import { EvalPage, CreateEvalDialog } from "./eval-page";
import { ReportsPage } from "./reports-page";
vi.mock("@tanstack/react-router", () => ({ Link: ({children}: {children: React.ReactNode}) => <a>{children}</a>, useNavigate: () => () => {} }));
vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));
const binding = {target_id: "guardrail-privacy", dataset_id: "ds-guardrail", dataset_version: 1, environment_id: "env-isolated", model_id: "glm-dev", langfuse_dataset_id: "real-dataset"};
beforeEach(() => {
  let environments = createFixtures().environments;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (_url.includes("/environments?")) return Response.json({items:environments,total:environments.length});
    if (_url.includes("/targets?")) return Response.json({items:createFixtures().targets.filter(t=>t.kind==="GUARDRAIL"),total:1});
    if (_url.includes("/targets/") && _url.endsWith("/config")) return Response.json({id:"guardrail-privacy",revision:"1:1",dataset_id:"ds-guardrail",dataset_version:1,environment_id:"env-isolated",environment_version:1,data_source:"published",scoring_mode:"mock",scorer_ids:["mock-score"]});
    if (_url.endsWith("/config")) return Response.json({bindings: [binding]});
    if (_url.includes("/datasets?")) return Response.json({items: createFixtures().datasets, total: createFixtures().datasets.length});
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      if (_url.includes("/environments/")) {
        const old=environments.find(e=>_url.endsWith("/"+e.id))!;
        const saved={...old,revision:"2:1",versions:[...old.versions,{...body.config,version:old.versions.length+1,publishedAt:new Date().toISOString()}]};
        environments=environments.map(e=>e.id===saved.id?saved:e);return Response.json(saved);
      }
      if (_url.includes("/datasets/")) return Response.json({...body, revision: "1:1"});
      return Response.json({...body, scorer_ids:["mock-score"],scoring_mode:"mock",model_id:"glm-dev",snapshot:createFixtures().evaluations.find(e=>e.snapshot.target.kind==="GUARDRAIL")!.snapshot, id: "eval-live-test", created_at: new Date().toISOString(), status: "RUNNING", experiment_id: "exp-live-test", completed: 0, phase: "QUEUED"});
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
      return id ? <ReportsPage evaluationId={id} onSelect={setId} /> : <TriggerTargetDialog targetId="guardrail-privacy" onStarted={setId} onClose={() => {}} />;
    }
    render(<WorkbenchProvider><Flow /></WorkbenchProvider>);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByLabelText("Test target *")).toBeNull();
    expect(screen.queryByRole("region", { name: "Target details" })).toBeNull();
    await waitFor(()=>expect((screen.getByRole("button",{name:"Run evaluation"}) as HTMLButtonElement).disabled).toBe(false));
    await user.type(screen.getByLabelText("Evaluation name"), "Inline safety check");
    expect(screen.queryByLabelText("Scoring mode")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review evaluation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Run evaluation" }));
    expect(await screen.findByRole("heading", { name: "Inline safety check" })).toBeTruthy();
    expect(screen.getByText("Evaluation in progress")).toBeTruthy();
    expect(screen.getByText(/Scores are development mocks/)).toBeTruthy();
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(call[1]!.body as string);
    expect(body).toEqual({name:"Inline safety check",config_revision:"1:1"});
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
    await user.click(await screen.findByRole("button", { name: "Guardrail conversation safety" }));
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
      await screen.findByRole("button", { name: "Edit configuration" }),
    );
    expect(screen.getByText("1000m = 1 CPU core. Requests and limits use this value.")).toBeTruthy();
    expect(screen.getByText("1024Mi = 1Gi. Requests and limits use this value.")).toBeTruthy();
    await user.clear(screen.getByLabelText("CPU (m)"));
    await user.type(screen.getByLabelText("CPU (m)"), "0");
    await user.click(screen.getByRole("button", { name: "Save v2" }));
    expect(screen.getByRole("alert").textContent).toContain("CPU");
    await user.clear(screen.getByLabelText("CPU (m)"));
    await user.type(screen.getByLabelText("CPU (m)"), "750");
    await user.click(screen.getByRole("button", { name: "Save v2" }));
    await waitFor(()=>expect(readState().environments[0].versions.map((v: {cpuMillicores:number})=>v.cpuMillicores)).toEqual([2000,750]));
    cleanup();
    render(<WorkbenchProvider><EnvironmentsPage /></WorkbenchProvider>);
    expect(await screen.findByText("750m")).toBeTruthy();
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
      if (_url.includes("/environments?")) return Response.json({items:createFixtures().environments,total:1});
    if (_url.includes("/targets?")) return Response.json({items:createFixtures().targets.filter(t=>t.kind==="GUARDRAIL"),total:1});
    if (_url.includes("/targets/") && _url.endsWith("/config")) return Response.json({id:"guardrail-privacy",revision:"1:1",dataset_id:"ds-guardrail",dataset_version:1,environment_id:"env-isolated",environment_version:1,data_source:"published",scoring_mode:"mock",scorer_ids:["mock-score"]});
    if (_url.endsWith("/config")) return Response.json({bindings: [binding]});
    if (_url.includes("/datasets?")) return Response.json({items: createFixtures().datasets, total: createFixtures().datasets.length});
      if (init?.method === "POST") return Response.json({detail: "Kubernetes is unavailable"}, {status: 502});
      return Response.json({items: []});
    }));
    render(<WorkbenchProvider><TriggerTargetDialog targetId="guardrail-privacy" onClose={close} /><StateProbe /></WorkbenchProvider>);
    await user.type(screen.getByLabelText("Evaluation name"), "Safety check");
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

it("filters Guardrail targets by provider", async () => {
 const user=userEvent.setup();render(<WorkbenchProvider><EvalPage /></WorkbenchProvider>);
 await screen.findByRole("button",{name:"Trigger"});
 expect(screen.getByRole("columnheader",{name:"Provider"})).toBeTruthy();
 await user.selectOptions(screen.getByLabelText("Provider"),"f5");
 expect(screen.queryByRole("button",{name:"Trigger"})).toBeNull();
 await user.selectOptions(screen.getByLabelText("Provider"),"nemo guardrail");
 expect(screen.getByRole("button",{name:"Trigger"})).toBeTruthy();
});

it("saves target Config without launching a job",async()=>{
 const user=userEvent.setup(),close=vi.fn();render(<WorkbenchProvider><CreateEvalDialog targetId="guardrail-privacy" onClose={close}/></WorkbenchProvider>);
 const save=screen.getByRole("button",{name:"Save config"});await waitFor(()=>expect((save as HTMLButtonElement).disabled).toBe(false));
 expect(screen.queryByLabelText("Evaluation name")).toBeNull();
 await user.click(save);await waitFor(()=>expect(close).toHaveBeenCalled());
 const writes=vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==="POST");
 expect(writes).toHaveLength(1);expect(writes[0]![0]).toContain("/targets/guardrail-privacy/config");
 expect(JSON.parse(writes[0]![1]!.body as string)).toMatchObject({dataset_id:"ds-guardrail",environment_version:1,data_source:"published"});
});
it("allows an empty trigger name and leaves naming to backend",async()=>{
 const user=userEvent.setup(),close=vi.fn();render(<WorkbenchProvider><TriggerTargetDialog targetId="guardrail-privacy" onClose={close}/></WorkbenchProvider>);
 const run=screen.getByRole("button",{name:"Run evaluation"});await waitFor(()=>expect((run as HTMLButtonElement).disabled).toBe(false));
 expect(screen.queryByLabelText("Dataset *")).toBeNull();await user.click(run);
 await waitFor(()=>expect(close).toHaveBeenCalled());
 const call=vi.mocked(fetch).mock.calls.find(([,init])=>init?.method==="POST")!;
 expect(JSON.parse(call[1]!.body as string)).toEqual({name:"",config_revision:"1:1"});
});
