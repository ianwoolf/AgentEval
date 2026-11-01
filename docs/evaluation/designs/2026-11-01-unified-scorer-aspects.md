# Unified scorer, dataset and report design

Status: revised design, not yet implemented. Supersedes duplicated dataset/scorer criteria editing in the earlier purpose-driven design. UI language: English.

## Problem and outcome
Dataset and scorer editors independently define aspects and acceptance text, while reports store scorer IDs without complete definitions. Users cannot distinguish coverage from measured quality. Make scorer versions the authoritative scoring specification; dataset coverage is derived; report definitions come from immutable execution snapshots.

## Vocabulary and ownership
- Aspect: reporting category owned by a scorer version. Completion, Factual grounding, User experience, Tool usage, Safety & risk, Custom. One primary aspect per scorer avoids double-counting. Optional tags classify without affecting scoring.
- Scorer: a versioned metric with name, description, aspect, evaluated subject, engine, input contract, scoring specification and threshold.
- Criteria: what counts as a good result. Replaces the ambiguous Requirements field.
- Evaluation steps: optional ordered judging procedure, separate from criteria. Adapter validation controls supported combinations; G-Eval uses criteria OR explicit steps, not both as simultaneous inputs.
- Expected output: case-specific reference in dataset rows, not a duplicate generic scorer expectation field.
- Dataset: cases, schema, scenario description, tags and version-pinned default scorer bindings. No editable scoring aspect or criteria.
- Report: actual results plus the scorer/aspect/threshold/source snapshot used for this run.

## Scorer list
Toolbar: search name/ID, Aspect, Engine, Status; New scorer action. Compact rows: Name + short description, Aspect, Engine, Version, Threshold, Execution readiness, actions. No full requirements paragraphs in list. Built-in versus custom source is secondary metadata, not the main grouping.

## Scorer detail
Dedicated detail view with back navigation; same layout for create/edit. Header contains name, version, execution status and Save draft / Publish actions.
1. Basics first: Name (wide), Engine, Aspect, Description (two lines), Evaluates (response/trajectory/tool calls/guardrail decision).
2. Scoring: Criteria textarea OR explicit Evaluation steps, selected through an authoring-mode control. Rubric score anchors are optional advanced configuration. No duplicate definition textarea. Threshold beside score interpretation.
3. Inputs and execution: required input fields as chips with mapping validation; judge model for LLM engines; installed library/version for rules; artifact/version for uploaded scripts. Only show settings relevant to the chosen engine. Specification-only and executable states are distinct.
4. Secondary tabs: Try it, Versions, Used by. Try it invokes a real supported engine or shows a clear unavailable reason; no simulated fixed-score test presented as validation.
Templates belong to New scorer → Start from template; choosing a template creates an editable draft, not a saved example or installed engine.

## Dataset detail
Header: Name, version, scenario description. Tabs: Cases, Schema, Scorers, Versions. Case reference fields include expected_output / expected_tools / expected_label as appropriate; retrieved evidence is distinct from expected answers.
Scorers tab lists pinned scorer versions, aspect, threshold, required inputs, and compatibility. Coverage chips are derived from those bindings and read-only. No scoring template selector on dataset. Optional import/schema templates are explicitly called Data schema templates.
Multiple datasets retain independent scorer bindings; no intersection of scorer IDs across datasets.

## Report
Overview begins with Aspect results, followed by scorer-level results and cases.
Each aspect displays pass rate, passed/evaluated count, errors, missing evidence, mock count and participating scorers. Aspect pass rate denominator includes failed/error/missing-required-evidence cases; queued/pending cases are shown separately. A case passes an aspect only when every required scorer in that aspect passes. Case identity is dataset ID + version + row ID; include check ID if distinct repeated checks exist.
Keep raw mean scores at scorer/version level. Do not average unrelated 0–1 metrics into an implied calibrated aspect score. Label headline number Aspect pass rate. No global quality score by default. Missing coverage is Not evaluated, never zero. Mock data is a separate demonstration group and excluded from real quality summaries.
Drilldown: Aspect → Scorer version → Dataset/cases → actual output, reference, score, threshold, reason, evidence and source.
Snapshot at run creation: scorer ID/version/name/aspect/criteria or steps/engine/input mappings/threshold/judge model or artifact/library version and source mode. Report reads this snapshot, not the current catalog. Result records reference that exact scorer binding.

## Migration
- Remove duplicate Dataset aspect/criteria controls. Preserve existing raw metadata for backwards compatibility; mark it legacy scenario metadata, not scoring truth.
- Copy scorer Requirements to Criteria only where existing authoring semantics are unambiguous; retain original version payloads and create new drafts for normalized fields.
- Legacy risk/tone/tool-use are IDs, not reliable aspects. Keep historical values visible under Unclassified, with Definition unavailable. Never guess aspect from names or apply current catalog definitions retroactively.
- Existing GLM run has real scores but incomplete historical scoring definitions; display that limit honestly. New GLM runs after snapshot integration verify the new report model.
- Retire demonstration catalog entries with reversible archival; retain history and explicit source labels.

## Implementation sequence and acceptance
1. Versioned scorer schema + authoring mode + engine readiness validation; backwards-compatible readers.
2. Snapshot scorer bindings in run creation, propagate to worker and persist typed result provenance. Test edits after run creation cannot change reports.
3. Scorer list/detail layout and filters; remove redundant text and put identity fields first.
4. Dataset binding editor and derived coverage; test two datasets with different scorers and multiple aspects.
5. Server-side aspect aggregation across all result pages; tests for heterogeneous thresholds, multiple scorers per aspect, errors, missing evidence, pending, mock/real isolation and unclassified historical data.
6. English report drilldown and source/status labels; export the same definitions and counts.
7. Rebuild frontend/backend/runner images, deploy local K8s; run GLM classification with deterministic risk scoring and a supported judge-based quality check once its adapter is implemented. Validate real provenance and aspect counts. Keep Reflection independently configurable.

## References
- https://deepeval.com/docs/metrics-introduction
- https://deepeval.com/docs/metrics-llm-evals
- https://deepeval.com/docs/evaluation-end-to-end-single-turn

Aspect grouping and aggregation above are AgentEval product decisions, not claimed DeepEval behavior.
