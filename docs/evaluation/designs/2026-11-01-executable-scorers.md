# Executable scorers: Rule and LLM judge

Status: revised frontend/backend design. No implementation or deployment in this design pass. Extends unified-scorer-aspects design; replaces shared generic execution forms.

## Verified implementation gap
ScorerConfig.kind is stored but never dispatched by the worker. InstalledScorerLibrary executes the library named in dataset.metadata.evaluation.scorers, currently including risk-classification. Editing natural-language Criteria does not change that Python function. The existing GLM validation calls GLM as the target and compares boolean labels deterministically; GLM is not the judge. The model client uses process-wide target-model environment variables and cannot safely switch independently among judge models.

## Product semantics
Aspect answers what quality dimension is measured. Engine answers how a score is computed. Keep these independent. Shared fields: name, description, aspect, evaluated subject, version, enabled, threshold. Rule, LLM judge and Python script have distinct configuration types. No implicit engine installation or mock fallback.

Rule means deterministic local computation without model calls. DeepEval DAG is not synonymous with this product type: its decision tree may contain LLM nodes. LLM judge evaluates a supplied completed target output; it must not generate or replace that output. Target model and judge model are independent.

## Frontend
Scorer list: compact Name/ID, Aspect, Engine, Version, Ready/Needs configuration/Unavailable. Search, Aspect and Engine filters in one wrapping toolbar. Remove wide prose columns and instructional banners; move explanations into contextual help. At narrow widths show stacked rows with the same identity/status; no sideways scrolling required for primary actions.

Dedicated detail page, identity header first: Name, Engine, Aspect, Description. Engine is locked on published versions; changing it starts a new draft with explicit replacement of incompatible settings. Main editor plus collapsible test panel; on narrow viewports the test panel stacks below. Tabs: Configuration, Versions, Used by.

### Rule configuration
- Operator: Exact match, Contains, Numeric comparison, Required tool calls (initial allowlist).
- Actual value: selected typed input binding, e.g. actual_output.has_issue.
- Expected value: reference binding or typed literal, explicitly selected; false/0/empty string are valid values, missing is not.
- Operator options: exact-match string normalization opt-in; numeric comparison operator; tool call name/arguments and order policy.
- Multiple conditions: All/Any; initial outcome score is 1 or 0. Show this scale and pass threshold.
- Read-only generated explanation, not editable natural-language scoring criteria. Advanced custom logic uses Python script engine.
- Try it: supplied input/output/reference/trace; evaluated operand values, each condition result, final score, pass/fail, reason and elapsed time. No judge/model/prompt fields.

Example: actual_output.has_issue equals expected_output.has_issue. true == true scores 1; false == true scores 0 with false-negative reason when using the risk-classification preset.

### LLM judge configuration
Explicit strategy choice:
1. G-Eval: criteria OR ordered evaluation steps; selected evaluation parameters; judge model; threshold; optional score anchors. The framework assembles the prompt. Preview the selected evidence and effective configuration; do not offer an unrelated raw prompt box as though it drives G-Eval.
2. Prompt judge: custom instructions with declared placeholders, model, output contract. This is a separate adapter and must not be labeled G-Eval.

Both modes use a typed Inputs panel: input, actual_output, expected_output, retrieval_context, tools_called, expected_tools, trajectory. Only explicitly selected evidence is sent. Capability/schema validation checks requirements for each metric and model.

Prompt example:
  Judge factual support using the following evidence.
  Question: {{input.question}}
  Answer: {{actual_output.answer}}
  Context: {{retrieval_context}}
  Criteria: {{criteria}}
  Return JSON containing score (0..1), reason, and evidence references.

Placeholder picker lists declared bindings. Parse strict {{path}} references; reject unknown variables at validation. JSON-serialize substitutions; no eval, code execution, arbitrary Jinja expressions, environment/secret access or recursive interpolation. Template content is trusted scorer configuration; sample content is untrusted quoted evidence, not instructions. Keep policy instructions and evidence in separate message sections. This reduces prompt-injection exposure but is not a guarantee of judge correctness.

Try it uses a stored/pasted actual output and invokes only the judge. Show rendered messages with evidence, model ID, score, concise reason, evidence, latency and tokens when available. Do not expose private chain-of-thought. Missing required values, unsupported model capability, timeout or invalid JSON are explicit errors, never synthetic passing scores.

### Python script
Separate engine with uploaded immutable artifact, entry point, input/output schema and isolation limits. No Git URL pretending to be an installed executable. Disabled until the container isolation adapter is available; existing specifications remain visible as unavailable.

## Backend contract
Use a discriminated union, not a kind field plus a bag of unrelated optional fields:
- rule: operator/version, typed bindings, literal/reference expectation, options, combination.
- llm_judge: strategy=geval|prompt, judge_model_ref, selected bindings, criteria OR steps OR prompt template (strategy-specific), model options, bounded timeout.
- python: artifact digest/version, entry point, contract version and resource profile.

Versioned scorer spec owns all execution settings and default threshold. Dataset bindings reference scorer ID/version and map fields; explicit threshold override is snapshotted if supported. Dataset metadata must not silently override engine/library/configuration. Missing scorer IDs or versions fail new binding publication/run validation. Legacy references remain readable for history.

API surface:
- GET /scorer-capabilities: installed engines/operators/versions, supported features and safe judge model metadata.
- POST /scorers/validate: normalize draft, validate engine settings/placeholders/input types; no model invocation.
- POST /scorers/test: project-scoped bounded job using exactly the same scorer adapter as batch runs; draft hash, sample evidence, timeout and effective mode recorded. Poll result by test ID.
- Existing draft/version endpoints enforce discriminator and immutable published specs. Return derived execution readiness, not client-authored readiness flags.

Runner:
1. Resolve all bindings and engine/model/artifact versions before scheduling.
2. Freeze full scorer specification, field mappings, threshold, adapter/package versions and safe judge model identity in run context.
3. Normalize target output into a shared evidence envelope once; evaluate each dataset's scorer bindings against it.
4. Dispatch RuleAdapter, GEvalAdapter, PromptJudgeAdapter or IsolatedScriptAdapter. Both Try it and batch call this dispatch boundary.
5. Use dependency-injected model clients keyed by explicit model ref; do not mutate process environment to switch judges. Credentials are resolved internally and never enter snapshots/prompts/logs/UI.
6. Persist score, threshold, passed, status, concise reason, evidence refs, source, scorer binding ID, model/adapter version, latency and usage. Invalid model responses are ERROR with no quality score.
7. Scoring-disabled mode bypasses all adapters/model calls and marks MOCK. Reflection remains independently controlled.

## Migration
Legacy specifications with no execution union become Needs configuration, not Ready. For the known risk-classification library, offer an explicit migration to Exact match using actual_output.has_issue and expected_output.has_issue; publish a new version. Retain old immutable definitions and historical execution provenance. Do not infer rules from prose or infer judge prompts from existing descriptions. Keep duplicate checks identifiable by ID.

## Delivery and acceptance gates
1. Typed schemas/capabilities, validation and migration draft. Test incomplete config, unknown placeholders, unsupported inputs/model capability and historical roundtrip.
2. Shared evidence resolver and deterministic rule adapter. Test bool vs int, missing vs null, numeric types, tool traces/order, no model client calls.
3. Prompt judge with independent GLM client and strict result parsing; test no target call, criteria/evidence routing, errors/timeouts and redacted logs.
4. G-Eval adapter with pinned compatible DeepEval version and disabled external telemetry/upload by deployment policy; verify adapter uses selected evidence and preserves immutable generated-step configuration when applicable. Research/install chosen package version at implementation time.
5. Engine-specific detail UI, compact list, real Try it and dataset field mappings. Test switching draft types and rejecting incompatible version assignments.
6. End-to-end: one GLM-generated answer, deterministic rule and a separate real GLM judge, distinct source/evidence/model traces; demonstrate different outputs under different rule settings and criteria. Re-run after editing a draft and confirm previous reports remain unchanged.
7. Rebuild frontend/backend/runner images, update local K8s, verify readiness and report/Aspect aggregation. Keep mock and real test runs distinct.

## References
- https://deepeval.com/docs/metrics-llm-evals
- https://deepeval.com/docs/metrics-custom
- https://deepeval.com/docs/metrics-introduction
- https://deepeval.com/docs/metrics-dag

The Rule builder, Prompt judge template syntax, API, UI and migration are AgentEval design decisions, not claimed DeepEval product features.

## Operator workflow amendment (2026-11-01)

The default standalone view exposes Evaluation and Reports. Manage workspace reveals Datasets, Scorers, Environments, in that order. This is a presentation mode, not an authorization mechanism; backend authentication remains unchanged.

Rule editing uses field / operator / comparison source / value. Report overview joins immutable dataset and scorer snapshots to dataset-specific aspect pass rates; scorer means remain separate from aspect pass rates. Configuration and raw diagnostics are progressive disclosures. Dataset/scorer/environment deletion archives records, leaving immutable versions and run evidence readable. New runs reject archived dataset/scorer bindings. The initialization script is idempotent, uses stable managed IDs, exports a backup before cleanup, and archives explicitly listed legacy fixtures and validation records.

Implementation sequence: compact operator entry; filter-style rules; dataset aspect aggregation and report overview; catalog archive API/UI; seed and cleanup script; regression tests; rebuild API/worker/UI; local Kubernetes rollout; real GLM batch verification and browser inspection.
