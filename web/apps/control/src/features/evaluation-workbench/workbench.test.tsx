/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider, useWorkbench } from "./provider";
import { DatasetsPage } from "./datasets-page";
import { EnvironmentsPage } from "./environments-page";
import { ScorersPage } from "./scorers-page";
import { CreateEvalDialog } from "./eval-page";
import { ReportsPage } from "./reports-page";
vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));
afterEach(cleanup);
function StateProbe() {
  const { state } = useWorkbench();
  return <output data-testid="state">{JSON.stringify(state)}</output>;
}
function readState() {
  return JSON.parse(screen.getByTestId("state").textContent!);
}

describe("interactive workbench", () => {
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
  it("requires scorers and captures the selected target in a new eval", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <WorkbenchProvider>
        <CreateEvalDialog onClose={close} />
        <StateProbe />
      </WorkbenchProvider>,
    );
    await user.type(screen.getByLabelText("Evaluation name *"), "Safety check");
    await user.selectOptions(screen.getByLabelText("Target type"), "GUARDRAIL");
    await user.click(screen.getByRole("button", { name: "Review evaluation" }));
    expect(screen.getByRole("alert").textContent).toContain("scorer");
    await user.click(
      screen.getByRole("checkbox", { name: /Policy compliance/ }),
    );
    await user.click(screen.getByRole("button", { name: "Review evaluation" }));
    await user.click(screen.getByRole("button", { name: "Run simulation" }));
    const run = readState().evaluations[0];
    expect(run.snapshot.target.kind).toBe("GUARDRAIL");
    expect(run.snapshot.scorers).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
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
