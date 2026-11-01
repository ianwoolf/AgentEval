# Basic and Guardrail catalog initialization

Script: `evaluation-backend/scripts/init_evaluation_catalog.py` (Python standard library).

Preview: `python scripts/init_evaluation_catalog.py --cleanup`

Apply: `python scripts/init_evaluation_catalog.py --apply --cleanup --backup /tmp/catalog-backup.json`

Supply `--api`, `--project`, `--model` for another environment. `EVAL_TRIGGER_TOKEN` supplies bearer authentication when required. Run inside the API Pod, or against a locally forwarded API. No provider secrets belong in fixtures.

The script creates two published datasets, four executable scorers, and a GLM environment cloned from the existing `env-isolated` execution policy. It updates the existing `guardrail-privacy` target configuration to use both datasets with dataset-specific scorers. Fixed IDs make repeated `--apply` safe; existing published records are not overwritten. A missing `env-isolated` policy must be configured before initialization.

Cleanup archives only the explicit legacy IDs listed in `LEGACY`, including obsolete validation targets. It exports their complete definitions to a mode-0600 JSON backup before archiving them. Copy the backup out of the Pod before replacing it. Use a new backup path for a repeated cleanup; existing backups are never overwritten.

Restore: `python scripts/init_evaluation_catalog.py --apply --restore-backup /tmp/catalog-backup.json`

This restores catalog visibility; immutable published versions and historical report snapshots were never deleted. Reconfigure a target before triggering if its selected resource has been archived. UI Delete uses the same archive mechanism. Restoring visibility is also available through `POST /api/v1/evaluations/catalog/{collection}/{id}/restore`.

The standalone UI defaults to operator view (Evaluation and Reports). Manage workspace switches to administrative configuration pages; it is a UI mode, not a new authentication or authorization boundary.
