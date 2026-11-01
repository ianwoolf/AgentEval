# Local Kubernetes release process

Every code change must be tested and rebuilt into new UI and API/runner image tags before updating the docker-desktop cluster. Do not reuse the 2.2 tag. API and generated runner Jobs must reference the same backend image.

Current release: demo-debug-20261101. Backend image was built with deploy/Dockerfile.worker-local-cache and UI with deploy/Dockerfile.evaluation-local-cache because Docker Hub base-image metadata requests timed out. These explicitly reuse local AMD64 2.2 dependency layers; rebuild from standard Dockerfiles whenever dependencies change. UI source must first pass the standalone build. Both images include nonroot debug tools.

Build from each repository root using --platform linux/amd64 for the local-cache Dockerfiles. Import both images with evaluation-backend/deploy/kubernetes/import-local-image.sh. Preserve existing model secrets and persistent volumes. Back up old deployments and ES documents before a schema migration. Configure API/runner image together, roll out, verify capability flags, UI proxy, historical report access, debug binaries and a no-model demo run.

Backup for this release: /private/tmp/evaluation-upgrade-20261101 (private temporary directory; move to durable protected storage if required). Contains original deployments and all 340 pre-migration ES documents. Old v1 indices remain unchanged. This release contains the first demo/debug implementation batch; the complete purpose-driven design is still in progress.

## Dataset-specific scoring release

Current local K8s release: dataset-scorers-20261101. Both frontend and backend rebuilt and imported; API and generated runner image tags match. Tests: backend 168 passed/5 skipped, workbench frontend 34 passed, TypeScript and standalone build passed. End-to-end run eval-72b679661988981abae4ebaf completed 4 samples with disjoint dataset scorers and mock provenance. Reports display dataset purpose and assigned scorers.

New target configuration accepts scorer_selection=dataset (use published dataset scorerIds and snapshot scorer metadata) or shared (legacy shared scorer_ids; default for old configurations). In dataset mode installed scoring, scorer_ids may be empty because the server resolves each dataset list. Mock scoring mode retains mock-score. Deployment-level disabled scoring preserves dataset scorer IDs but runs deterministic illustrative scores. This release does not yet include the Objectives/Suites registry, custom script execution or DeepEval integration.

## 2026-11-01 structured criteria UI

- API/runner: `evaluation-worker:criteria-ui-20261101`. UI: `evaluation-ui:criteria-ui-r2-20261101`.
- Catalog shows purpose coverage; Datasets and Scorers expose aspect, subject, expected behavior, requirements and evidence.
- Custom scorer specifications persist in project-scoped Elasticsearch records, with immutable version history and revision conflict checks. Templates are explicitly specifications, not installed engines.
- Existing dataset metadata and published versions remain unchanged. Define new criteria on a draft and publish when ready.
- Verified: 170 backend tests passed (5 skipped), 39 frontend tests passed, TypeScript and standalone build passed. Browser scorer publish/reload persistence passed.
- DeepEval execution and script upload/isolation remain outstanding.

## Compact workbench release — 2026-11-01

- API / worker: `evaluation-worker:compact-workbench-20261101`
- UI: `evaluation-ui:compact-workbench-20261101-v3`
- Context / namespace: `docker-desktop` / `evaluation`.
- Operator view defaults to Evaluation and Reports. Administrator navigation is Datasets → Scorers → Environments.
- Rule field/operator/value editor; scorer Definition/Execution tabs; report Overview/Samples/Configuration tabs.
- Catalog archiving preserves immutable versions. Initialization and restoration: `2026-11-01-catalog-initialization.md`.
- Cleanup backup copied to `/private/tmp/evaluation-catalog-backup-20261101.json` (0600).
- Live report: `eval-56531751de604d97b6f56671`; experiment `exp-56531751de604d97b6f56671810b75af`.
- Real GLM validation: 6 samples, 14 real scores; Rule, prompt judge, and DeepEval G-Eval complete. Basic completion 2/2 and Guardrail risk 4/4 pass, no missing scores or errors. These are small baseline validation cases, not a comprehensive model-quality benchmark.
- Backend regression: 176 passed, 5 skipped, plus new dataset-aspect aggregation regression passed. Frontend: 40 passed; TypeScript and production build passed. Container curl/jq verified.
- Initialization rerun verified: 2 datasets, 4 scorers, 2 environments, 1 target; no duplicate versions.

- Negative-control Try it checks: all three engines return real score 0 for mismatched risk labels.
