# Run-scoped Guardrail target and comparable reports

Evaluation configuration owns name/type, all pinned dataset versions, scorer/aspect bindings and environment version. Configure no longer selects a Provider or Guardrail instance. Saving creates the next Evaluation version. Existing published resource versions remain immutable.

Trigger reads the saved config revision, displays all datasets without checkboxes and chooses Provider -> configured Guardrail instance. Every Guardrail run uses all datasets in saved order; partial/extra datasets are rejected by both trigger and direct-run validation. Target connection is resolved for that individual run and snapshotted with provider, instance and endpoint. Same Evaluation/version may target different Guardrail instances.

POST /targets/{id}/runs adds provider and guardrail_id. New config records have no default connection; old stored defaults remain a compatibility fallback for older API callers. The UI always explicitly chooses the run target. POST /targets/{id}/configuration accepts nullable provider/guardrail_id; it validates data/scorer/environment bindings independently of an instance connection. Trigger performs instance availability and credential validation.

Run context persists evaluation_config_id and evaluation_config_version from the saved target version. GET /reports/{experiment_id} returns evaluation_config identity. Compare menu is portaled to the report header top-right and requests GET /guardrail-reports?config_id=...&config_version=... . Options show job report ID and execution start time, and exclude the current report. Different config IDs or versions do not appear. Comparison uses immutable run summaries, not the latest config document.

Before tests, user explicitly approved deleting all individual-project reports, samples, traces and corresponding jobs while preserving resources/configurations. Deleted 33 run documents, 202 samples and 551 traces; verified no matching report documents remained. Tests then create new acceptance reports.

Local images: evaluation-ui:trigger-target-20261104 and evaluation-worker:trigger-target-20261104; Mock unchanged. No new ConfigMap/Secret keys. Docker Hub tags unchanged.


Verification: 217 full backend tests passed (5 skipped), 23 focused tests passed after direct-route guard validation, 5 frontend interaction tests passed. New configuration trigger-compare-38efeb4d generated v1 runs eval-19eb17391e7b670750a28006 (F5) and eval-fa43c580d7c0259b7185aca6 (NeMo), and v2 run eval-c24b45ce4cb78e45faabbd49. All completed 8 samples across 2 fixed datasets. Version-scoped comparison query returns exactly two v1 reports and one v2 report. Only these three new acceptance reports remain after cleanup. UI/API deployed successfully; Mock unchanged.
