import { describe, expect, it } from "vitest";
import { parseImport, mapImport } from "./import-data";
import {
  createFixtures,
  createEvaluation,
  publishDataset,
  publishScorer,
  advanceEvaluation,
} from "./domain";

describe("dataset import boundary", () => {
  it("parses quoted CSV including escaped quotes, commas and multiline fields", () => {
    expect(
      parseImport(
        'question,answer\r\n"Hello, world","Say ""hi""\nplease"',
        "csv",
      ),
    ).toEqual([{ question: "Hello, world", answer: 'Say "hi"\nplease' }]);
  });
  it("rejects malformed CSV, duplicate headers and non-object JSON rows", () => {
    for (const raw of ["a,a\n1,2", "a,b\n1", 'a\n"unterminated'])
      expect(() => parseImport(raw, "csv")).toThrow();
    expect(() => parseImport("[null]", "json")).toThrow();
    expect(() => parseImport('{"a":1}\nnot-json', "jsonl")).toThrow();
  });
  it("validates all rows before returning typed values, retaining false and zero", () => {
    const fields = [
      {
        name: "count",
        type: "number" as const,
        role: "input" as const,
        required: true,
        description: "",
      },
      {
        name: "ok",
        type: "boolean" as const,
        role: "reference" as const,
        required: true,
        description: "",
      },
    ];
    expect(
      mapImport([{ n: "0", flag: "false" }], fields, {
        count: "n",
        ok: "flag",
      }),
    ).toEqual([{ count: 0, ok: false }]);
    expect(() =>
      mapImport([{ n: "oops", flag: "false" }], fields, {
        count: "n",
        ok: "flag",
      }),
    ).toThrow(/row 1/i);
    expect(() =>
      mapImport([{ n: "1" }], fields, { count: "n", ok: "missing" }),
    ).toThrow(/ok/);
  });
});

describe("evaluation snapshots", () => {
  it("uses the published dataset scorer choices and preserves historical associations", () => {
    const state = createFixtures();
    const original = state.datasets[0]!;
    original.draft.scorerIds = ["sc-safety"];
    state.datasets[0] = publishDataset(original);
    const dataset = state.datasets[0]!;
    const request = {
      name: "Dataset scorer selection", targetId: state.targets[0]!.id,
      datasetId: dataset.id, datasetVersion: 2,
      environmentId: state.environments[0]!.id, scorerIds: ["sc-safety"],
    };
    const run = createEvaluation(state, request);
    dataset.draft.scorerIds = ["sc-tone"];
    expect(run.snapshot.dataset.scorerIds).toEqual(["sc-safety"]);
    expect(() => createEvaluation(state, { ...request, scorerIds: ["sc-tone"] })).toThrow(/configured/);
    expect(() => createEvaluation(state, { ...request, datasetVersion: 1, scorerIds: ["sc-tone"] })).not.toThrow();
  });
  it("does not bind datasets to targets and freezes resources at launch", () => {
    const state = createFixtures();
    const run = createEvaluation(state, {
      name: "Regression",
      targetId: state.targets[0]!.id,
      datasetId: state.datasets[0]!.id,
      datasetVersion: 1,
      environmentId: state.environments[0]!.id,
      scorerIds: [state.scorers[1]!.id],
    });
    state.datasets[0]!.versions[0]!.rows[0]!.messages = "changed";
    state.environments[0]!.versions[0]!.network = ["changed"];
    state.environments[0]!.versions[0]!.modelId = "changed-model";
    state.environments[0]!.versions[0]!.guardrailId = "changed-guardrail";
    state.environments[0]!.versions[0]!.runner.concurrency = 8;
    expect(run.snapshot.environment.modelId).toBe("demo-model-support");
    expect(run.snapshot.environment.guardrailId).toBe("guardrail-privacy");
    expect(run.snapshot.environment.runner.concurrency).toBe(1);
    expect(run.snapshot.dataset.rows[0]!.messages).not.toBe("changed");
    expect(run.snapshot.environment.network).not.toEqual(["changed"]);
    expect(state.datasets[0]).not.toHaveProperty("targetId");
  });
  it("rejects unpublished data and disabled scorers", () => {
    const state = createFixtures();
    const request = {
      name: "Regression",
      targetId: state.targets[0]!.id,
      datasetId: state.datasets[0]!.id,
      datasetVersion: 99,
      environmentId: state.environments[0]!.id,
      scorerIds: [state.scorers[1]!.id],
    };
    expect(() => createEvaluation(state, request)).toThrow(/version/i);
    state.scorers[1]!.enabled = false;
    expect(() =>
      createEvaluation(state, { ...request, datasetVersion: 1 }),
    ).toThrow(/scorer/i);
  });
  it("publishes copies and preserves prior versions", () => {
    const state = createFixtures();
    const dataset = publishDataset(state.datasets[0]!);
    dataset.draft.rows[0]!.messages = "edited";
    expect(dataset.versions[1]!.rows[0]!.messages).not.toBe("edited");
    const scorer = publishScorer(state.scorers[2]!);
    expect(scorer.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(() => publishScorer(state.scorers[0]!)).toThrow(/built-in/i);
  });
  it("does not advance cancelled runs and completes only after all sample results", () => {
    const state = createFixtures();
    let run = createEvaluation(state, {
      name: "Run",
      targetId: state.targets[0]!.id,
      datasetId: state.datasets[0]!.id,
      datasetVersion: 1,
      environmentId: state.environments[0]!.id,
      scorerIds: [state.scorers[1]!.id],
    });
    expect(advanceEvaluation({ ...run, status: "CANCELLED" }).status).toBe(
      "CANCELLED",
    );
    for (let i = 0; i < run.snapshot.dataset.rows.length; i++)
      run = advanceEvaluation(run);
    expect(run.status).toBe("COMPLETED");
    expect(run.results).toHaveLength(run.snapshot.dataset.rows.length);
  });
});

describe("guardrail conversation fixtures", () => {
  it("uses structured conversations and boolean risk labels", () => {
    const dataset = createFixtures().datasets[0]!;
    expect(dataset.draft.fields.find((f) => f.name === "messages")?.type).toBe(
      "json",
    );
    expect(dataset.draft.fields.find((f) => f.name === "has_issue")?.type).toBe(
      "boolean",
    );
    for (const row of dataset.draft.rows) {
      expect(Array.isArray(row.messages)).toBe(true);
      expect(typeof row.has_issue).toBe("boolean");
      expect(row.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user" }),
        ]),
      );
    }
    expect(dataset.draft.rows.some((r) => r.has_issue === false)).toBe(true);
    expect(dataset.draft.rows.some((r) => r.has_issue === true)).toBe(true);
  });
  it("reports classification matches, false positives and false negatives consistently", () => {
    const state = createFixtures();
    for (const run of state.evaluations) {
      expect(run.snapshot.target.kind).toBe("GUARDRAIL");
      for (const result of run.results) {
        expect(typeof result.output.has_issue).toBe("boolean");
        expect(result.status).toBe(
          result.output.has_issue === result.reference.has_issue
            ? "PASS"
            : "FAIL",
        );
      }
    }
    const results = state.evaluations[0]!.results;
    expect(
      results.some(
        (r) => r.reference.has_issue === true && r.output.has_issue === false,
      ),
    ).toBe(true);
    expect(
      results.some(
        (r) => r.reference.has_issue === false && r.output.has_issue === true,
      ),
    ).toBe(true);
  });
});

describe("Git scorer source", () => {
  it("requires a repository and a safe repository-relative script path", () => {
    const scorer = createFixtures().scorers[2]!;
    scorer.draft.repoUrl = "https://github.com/example/scorers.git";
    for (const scriptPath of [
      "",
      "/score.py",
      "../score.py",
      "scripts/../../score.py",
      "C:\\score.py",
    ]) {
      scorer.draft.scriptPath = scriptPath;
      expect(() => publishScorer(scorer)).toThrow(/relative/i);
    }
    scorer.draft.scriptPath = "scorers/guardrail.py";
    scorer.draft.repoUrl = "";
    expect(() => publishScorer(scorer)).toThrow(/repository/i);
    scorer.draft.repoUrl = "git@github.com:example/scorers.git";
    const published = publishScorer(scorer);
    scorer.draft.scriptPath = "other.py";
    expect(published.versions.at(-1)?.scriptPath).toBe("scorers/guardrail.py");
  });
});
