# Evaluation workflow unification

User-approved order: publish Dataset -> prepare Scorer -> configure Evaluation -> repeat Trigger -> Report.

- Dataset owns data/schema/type; publishing must not require a scorer. Legacy scoring fields are preserved for historical versions.
- Evaluation owns pinned dataset/scorer pairs, aspect/label mapping, target connection and environment version.
- One Configure wizard replaces Edit/Config. Save target metadata and configuration atomically in the target document.
- Trigger accepts only configured dataset subset and matching config revision. No target/environment/version/scorer overrides.
- Dataset/scorer usage is read-only and derived from active Evaluation configurations.
- Run snapshots freeze selected bindings and Git commits; historical reports stay unchanged.

Progress: implemented and deployed locally (2026-11-03).

## API and storage

- POST /targets/{id}/configuration accepts target, config and the target revision. It validates all bindings before one optimistic-concurrency write to the target document. The nested evaluation_config contains pinned datasets, guardrail_bindings, environment and execution_mode. Existing target-config records remain readable for compatibility.
- GET /targets/{id}/config reads the embedded config first and returns the owning target revision.
- POST /targets/{id}/runs accepts config_revision, optional run name and configured dataset subset. Target/environment/scorer/version overrides are rejected. Omitted subset means all configured datasets.
- POST /guardrail-runs is a compatibility route and now also requires config_revision and the configured environment/subset. It cannot bypass configuration.
- Generic datasets keep their data contract. Guardrail datasets can omit the legacy guardrail/scorer fields; input/label/strategy validation still applies. The evaluation binding owns label_mapping and scorer/aspect validation.
- ES indices do not change. New consolidated configuration is in the existing records index, record_type=target, spec.evaluation_config. Run snapshots remain in the run record.

## UI

Evaluation Configure is one three-step wizard: Target -> Datasets & scorers -> Environment. Save validates and persists all settings together. Save & run opens the configured-subset Trigger dialog. Dataset editor has Configuration, Data & fields and Versions; it no longer owns scorer selection or target association controls. Dataset and Scorer usage views are derived, read-only references to saved evaluations. Existing immutable versions and reports are not rewritten.

## Verification

- Backend full suite: 206 passed, 5 skipped; after adding pinned scorer snapshot assertions, 27 focused tests passed.
- Frontend: build passed and 2 interaction tests passed (configured subset only; unified atomic save).
- Published two synthetic datasets without scorers, then paired them with Git classifier v3 in workflow-eval-c159a2d7.
- Out-of-config dataset request rejected with 422.
- Subset run eval-3f10275e6d50ff3ae3d5f1ce completed 4 samples, TP/FP/TN/FN each 1, errors 0.
- Repeat run eval-412083be0fb5a34d7fd9b543 completed 8 samples across both datasets; each dataset has TP/FP/TN/FN each 1, errors 0.
- Local images: evaluation-ui:workflow-20261103-r2; evaluation-worker:workflow-20261103. API and new Runner jobs use the latter. Mock service unchanged. Docker Hub 2.3.2 is not overwritten.

