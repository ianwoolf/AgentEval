# Purpose-driven evaluation: design and delivery breakdown

Status: proposed for review; no product code or deployment changed.

## Intent and scope
Users select understandable evaluation objectives, inspect coverage and acceptance criteria, and obtain evidence-based reports. Objectives include business completion, factual grounding, user experience, safety/risk, tool usage and custom categories. All product UI text is English. DeepEval is an optional scoring adapter, not the owner of orchestration or storage.

Current baseline: datasets already contain objective, tags, metadata and scorerIds. Multi-dataset runs currently share scorer_ids. Scorers currently load trusted installed Python entry points. No explicit report reflection implementation was found in the workbench/backend searched; Reflection is defined here as a report-level explanation and recommendations, not agent internal reasoning.

## Domain model
- EvaluationObjective: stable ID, category, name, description, acceptance criteria, required evidence, owner and immutable published version.
- EvaluationSuite: versioned collection of checks. Each check references objective version, dataset version, optional sample filter, scorer versions, thresholds and aggregation rule.
- Dataset: reusable versioned test data; retains default scorer bindings. A suite snapshots these bindings, optionally overriding them explicitly per check. No global intersection requirement.
- Scorer: engine (builtin, script, deepeval), category, purpose, input contract, output contract, version, artifact digest, limits and execution requirements.
- Run: immutable suite/check/input selection snapshot, target/environment versions, effective feature modes, judge configuration, scorer digests and execution IDs.
- Result: run/check/dataset/sample/scorer IDs; value, threshold, passed, status, reason, evidence references, duration and source (real/mock).
- Reflection: report-level status, source, model/config version and evidence-linked observations/recommendations. Independent of scoring.

A sample can support multiple objectives. Execute target once per unique input + target/environment context where safe; apply relevant scorers independently. Distinct uploads and explicitly repeated stochastic trials must not be deduplicated. Coverage and aggregation use check/sample identities, not an accidental cross-dataset average.

## Demo feature switches
Deployment configuration exposes EVAL_SCORING_ENABLED and EVAL_REPORT_REFLECTION_ENABLED; default false for the demo deployment. Explicit production configuration enables them. Expose only effective nonsecret capabilities via GET /api/v1/evaluations/capabilities. Server validates configuration; missing/invalid configuration is shown explicitly by UI, never inferred as real mode.

| Scoring enabled | Reflection enabled | Behavior |
|---|---|---|
| false | false | Runner emits deterministic mock scores; UI renders local mock reflection |
| false | true | Runner mock scores; real reflection is not invoked, UI shows Demo reflection because evidence is mocked |
| true | false | Real scores; UI renders mock reflection labeled independently |
| true | true | Real scores and evidence-based reflection |

Disabled scoring bypasses all builtin/custom/DeepEval execution, scoring dependency initialization and judge calls. Mock output is deterministic per sample/scorer and labeled, with a documented demo profile; no random scores or hidden fallback. Target execution remains real unless an independently explicit target-demo mode is configured; these switches alone do not guarantee offline target execution.

Disabled reflection triggers no reflection API/model calls. UI generates a stable local fixture from report structure, with `Demo reflection — illustrative only`. All score cards, drilldowns, exports and comparisons retain source labels. Mock results never satisfy a real release gate or enter real quality baselines. UI-generated reflection is not persisted as a real conclusion.

Snapshot modes when a run starts; deployment changes affect new runs. A live server disable acts as a kill switch for pending real calls: mark blocked/cancelled with reason rather than converting existing real runs into mock. Historical reports preserve original modes. Real-mode failures are explicit errors, never silent mock substitutions.

## English UI
Navigation: Overview, Evaluation Suites, Objectives, Datasets, Scorers, Runs, Reports.

Suite editor: Purpose & Scope → Checks & Coverage → Execution → Review & Run.
Check cards show objective, category, scenario, sample count, pass criteria and evidence readiness. Dataset/scorer versions are expandable technical details. Empty/error states explain which evidence or scorer configuration is missing.

Example objectives: Business Completion; Factual Grounding; User Experience; Tool Usage; Safety & Risk; Custom. Categories are extensible, not a fixed business-only taxonomy. Tags (refund, Chinese, multi-turn, high-risk) are filters, not executable acceptance criteria.

Scorer editor: Name, Category, Purpose, Required Inputs, Scoring Criteria, Threshold, Engine. For Custom Python: Upload Script → Validate → Test with Sample → Publish Version. Show errors with line/context information and captured bounded logs. Builtin and DeepEval scorers use forms; raw module names are advanced details.

Report: objective-level scorecard first, then coverage, failed criteria, Reflection, dataset/sample evidence and Runner Logs. Distinguish Failed, Error, Not Evaluated, Not Applicable and Mock. No evidence means Not Evaluated, never Pass. Show numerator/denominator and missing evidence. Different scorer scales are not averaged together; each objective explicitly declares its aggregation (initially all required checks must pass, plus per-check pass-rate threshold). Tables show an em dash for non-applicable scorers.

## Script scorer upload and execution
Initial scope: one UTF-8 Python .py file, bounded size, standard-library-only runtime. Arbitrary pip installs, shell entrypoints and zip bundles are out of scope for v1. Validate syntax and entrypoint without importing/executing in API. This is validation, not a safety proof.

Contract: score(input, output, reference, metadata, evidence) returns JSON {value: number in [0,1], reason: string, evidence_refs: list}. Runner derives passed from the versioned threshold. Reject NaN, infinity, invalid schemas and oversized output. Separate protocol JSON from stdout/stderr logging. Missing evidence and scorer execution errors are distinct outcomes.

Store uploaded artifacts outside ES as immutable content-addressed blobs; ES stores metadata/digest/version. Compose uses persistent artifact volume; Kubernetes uses configured persistent artifact storage. API never imports uploaded code. Publish freezes content and digest. Old runs retain their artifacts. Upload replacement creates a new version.

Execute scripts in separate constrained scorer containers supervised by the trusted runtime: nonroot, read-only filesystem, temporary scratch, CPU/memory/PID/time/output caps, no Docker socket, host mounts or application secrets, network disabled by default. Pass only bounded per-sample JSON and read-only script artifact. Trusted orchestrator owns container lifecycle; uploaded code cannot access orchestration APIs. Timeout/crash yields a scorer error, preserving other scorer results and cleanup logs. Network/model-capable custom scripts require a future explicit capability design; DeepEval uses a separate trusted adapter with configured judge credentials.

## DeepEval integration and evidence
Implement an engine adapter returning the existing normalized result contract. Start with Faithfulness and GEval; add tool/trajectory metrics once evidence capture is validated. Pin dependency and metric versions; record judge model, criteria, threshold, retry policy, latency and cost when available. Judge budget/concurrency are independent of target-model settings. Do not upload datasets to Confident AI by default.

Normalize retrieved context, reference sources, actual tools, expected tools and final business-state assertions. Identify MCP tools by server + tool, retaining call ID/order, redacted arguments and outcome. A statement in an answer is not proof of a tool call. Prefer deterministic checks for required calls/arguments and business-state assertions; use model-based judgement for semantic criteria. Faithfulness measures grounding in supplied sources, not external truth.

## Runner diagnostics
Structured JSON events: run.accepted, input.loaded, target.started/completed/failed, dataset.started/completed, scorer.started/completed/failed/timed_out, collector.flush, report.persisted, cleanup.completed/failed, run.completed/failed.

Fields: timestamp, level, event, request_id, run_id, check_id, dataset_id/version, sample_id, scorer_id/version, engine, source, container/job ID, attempt, elapsed_ms and sanitized error_type. Include evidence presence/counts and input sizes without raw sensitive contents. Emit startup configuration summary excluding credentials. Secrets, tokens, authorization headers and raw prompts/outputs are redacted by default; bounded opt-in debug capture has retention limits.

Persist searchable run-event records through the trusted collector; keep stdout fallback for collector failures. UI provides filters, bounded pagination and redacted download. Record lost/truncated log counts. Never attach full Docker inspect output to user reports. Add per-stage timeouts and heartbeat/progress so a stalled scorer can be distinguished from target or storage delays.

## Compatibility and rollout
Keep existing datasets/runs readable. Derive draft suites from existing target configurations; require review before publication. Existing shared scorer selection remains the legacy mode, not silently reinterpreted as all dataset defaults. New suites resolve per-check scorer bindings server-side and freeze them at run creation. Keep legacy API compatibility during transition. Existing mock records remain mock. Do not rewrite old reports or delete ES indices.

Build new frontend/backend images under a new explicit release tag; preserve deployed 2.2 and volumes for rollback. Migrate additively, back up data before deployment, verify both Compose and Kubernetes contracts. Rollback disables new run creation if the older API cannot interpret new suites, while preserving new records for forward recovery.

## Delivery breakdown and acceptance
1. Contracts and fixtures: finalize objective/suite/check/result/capability schemas and compatibility rules. Acceptance: example business, risk and MCP suites; mode truth table; old fixtures remain readable.
2. Demo controls: configuration, capabilities API, snapshotting, runner mock and UI reflection mock. Acceptance: verify all four flag combinations; disabled engines make zero judge/custom-script calls; labels survive exports; live kill switch tested.
3. Per-dataset/check execution: resolve and validate scorer mappings, pin versions, execute independently, aggregate by check. Acceptance: A uses S1/S2 and B uses S3; overlapping IDs with different versions stay isolated; uploads and legacy single-dataset runs work.
4. Diagnostics foundation: correlated structured events, redaction, bounded log storage and run log APIs. Acceptance: target failure, scorer timeout and persistence failure can be localized; planted secrets do not appear in logs.
5. Custom script scorers: upload/artifact/version endpoints, validation, isolated test runner, publication and runtime integration. Acceptance: valid script, syntax error, invalid output, infinite loop, excess output and denied network/filesystem attempts; other scorers continue and resources are cleaned up.
6. Purpose-first UI: suites/objectives, coverage, English copy and script wizard. Acceptance: a user can explain purpose and pass criteria before running; risk objectives work alongside business objectives; no new Chinese product text.
7. DeepEval adapter and real Reflection: evidence mapping, judge configuration/budgets, evidence-grounded report generation with explicit errors. Acceptance: fixture grounding/tool evidence, missing-evidence behavior, judge failure/cost controls; real outputs clearly separated from mocks.
8. Reports and release: objective aggregation, comparison provenance, logs and export; migration rehearsal and new-image deployment. Acceptance: complete demo run with external scoring unavailable; real integration run separately when judge access exists; historical report compatibility and rollback drill.

Dependencies: 1 → 2/3/4; 3+4 → 5; 1+2+3 → 6; 3+4 → 7; all → 8. These are reviewable milestones, not an instruction to implement before design approval.

## Decisions to confirm
Reflection means report explanation/recommendations, not agent chain of thought. Initial custom scripts are Python and offline. Business continuity means workflow completion/recovery unless redefined. Production thresholds and mandatory risk gates are supplied by suite owners, not invented global defaults.

## Research references
https://deepeval.com/docs/evaluation-datasets
https://deepeval.com/docs/metrics-faithfulness
https://deepeval.com/docs/metrics-tool-correctness
https://deepeval.com/docs/metrics-task-completion
https://deepeval.com/docs/metrics-llm-evals
https://docs.langchain.com/langsmith/manage-datasets-in-application
https://langfuse.com/docs/evaluation/experiments/data-model
https://www.promptfoo.dev/docs/configuration/reference/

## Approved refinement: image debugging tools
User approved the design and requested curl and necessary base debugging tools. Install them in final runtime stages, not only build stages. Backend Debian runtime: curl, ca-certificates, jq, procps, iproute2, dnsutils, netcat-openbsd. Both Nginx Alpine runtime variants: curl, ca-certificates, jq, procps, iproute2, bind-tools, netcat-openbsd. Retain nonroot worker UID 10001 and Nginx UID 101, read-only runtime settings, and current health checks. These tools do not enable network access inside isolated script containers. Do not install Docker CLI, SSH server, compilers or package installers for user scripts. Verify executables in built images and HTTP/DNS connectivity on the evaluation network; test both linux/amd64 and linux/arm64 when publishing multiarch images.

Defaults and limits for first implementation: script upload 256 KiB; scorer JSON input 8 MiB and result 64 KiB; stdout/stderr 64 KiB each with truncation marker; scorer container 30 seconds, 0.5 CPU, 256 MiB, 64 PIDs, 16 MiB tmpfs. Run log retention 7 days, 10 MiB per run, paginated reads of at most 200 events. These are deployment-configurable ceilings; suite authors cannot raise them. Required-evidence and engine capability checks occur before starting a real run. Mock mode still validates structural references and immutable versions, but does not require installed scoring dependencies, judge credentials or real evidence to produce illustrative output.
