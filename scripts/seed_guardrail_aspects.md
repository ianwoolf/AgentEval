# Guardrail aspect demo datasets

Run from the AgentEval root (Python 3, standard library only):

```bash
python scripts/seed_guardrail_aspects.py --dry-run
python scripts/seed_guardrail_aspects.py --api-base http://127.0.0.1:18082/api/v1/evaluations --project individual
```

For a remote backend use its /api/v1/evaluations URL. Set EVAL_TRIGGER_TOKEN in the environment if API token authentication is enabled; tokens are not printed or accepted as CLI arguments. EVAL_API_URL and EVAL_PROJECT_ID can provide defaults. --prefix creates an independent dataset ID namespace; --output datasets.json exports all eight documents.

The script creates eight independent datasets and publishes v1 (24 rows each, 192 rows total): Prompt Injection, Jailbreak, PII Leakage, Harmful Content, Hate Speech, Sexual Content, Illicit Activity, Benign Requests. IDs use guardrail-aspect-demo-<aspect>. Existing IDs are skipped, not overwritten; published versions and existing reports remain untouched. A conflict or authentication error stops with the failing dataset ID.

These are synthetic fixtures, not a safety-quality benchmark. Inputs use [mock:unsafe] to exercise the baseline Mock rule. Marker/label composition intentionally varies across aspects. Benign Requests contains safe labels only, so recall can be N/A. The Mock service can randomly flip decisions according to its configured rate. No scorer is needed to publish; bind a Git classification scorer when creating/updating an Evaluation. Metadata aspect_id/aspect_name prefill the Evaluation aspect fields.

To see the names in a new report: Configure an Evaluation, select the eight published datasets, choose the Git classification scorer for each, use safe->safe and unsafe->unsafe label mapping, and a Model-none environment. Save, then Trigger with the desired Provider/instance. Existing reports retain their original datasets. This script does not alter any existing Evaluation or automatically launch a run.

## Remote endpoint troubleshooting

`--api-base` accepts either a host URL (for example `http://server:8080`, automatically expanded to `/api/v1/evaluations`) or the full API base (`http://server:8080/api/v1/evaluations`). Do not append `/datasets` or a dataset ID. `--project` must match the deployment project ID.

```bash
python scripts/seed_guardrail_aspects.py --api-base http://YOUR_HOST:8080/api/v1/evaluations --project individual
```

The script now checks `GET /datasets?limit=1` before creating anything and includes the HTTP method/path and API error detail on failure. A 404 from the individual dataset existence check is expected: it proceeds to POST creation. A 404 from the collection check indicates the URL/proxy route is wrong. A creation 404 requires inspecting the returned API detail and backend logs; it is not a normal missing-dataset check. Use the updated script from this repository; no image upgrade is needed for this script change.
