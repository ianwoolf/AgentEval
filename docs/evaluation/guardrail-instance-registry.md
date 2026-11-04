# Configured Guardrail instances

Evaluation Configure selects Guardrail -> Provider -> Instance. Provider options and instance lists come from GET /api/v1/evaluations/guardrail-instances (optional provider query). Switching provider clears the instance. Disabled/deleted entries remain visibly unavailable for existing configurations and prevent save/run. Environment no longer selects a Guardrail instance.

EVAL_GUARDRAIL_REGISTRY points to a deployment-owned JSON file (deploy/examples/guardrails.json). Required instance fields are id and address (full Scan endpoint). Provider IDs preserve current catalog values: f5 and nemo guardrail. IDs are unique within each provider. Optional name/enabled/token_env control presentation and credentials. Addresses cannot contain embedded credentials or query/fragment strings.

Kubernetes: apply deploy/kubernetes/guardrails.yaml; mount ConfigMap evaluation-guardrails at /guardrails; set EVAL_GUARDRAIL_REGISTRY=/guardrails/guardrails.json. The existing EVAL_MOCK_GUARDRAIL_TOKEN Secret reference is reused for the example instances. For another instance add its token environment variable from a Secret and reference that variable name with token_env. Restart API after changing the file/config. Restarting is intentional; configuration is cached for each API process.

Compose: config/guardrails.json is mounted as a Compose config. token_env can reference an environment variable or its corresponding <NAME>_FILE secret path. The example uses EVAL_MOCK_GUARDRAIL_TOKEN_FILE=/run/secrets/guardrail_token. Re-run init_secrets.py to create missing files; populate .secrets/guardrail_token with the token accepted by your endpoint. Edit addresses to match your deployed Guardrail: the example references a separately deployed mock service, not an automatic Compose mock service. No token values enter the JSON or UI response.

Compatibility: deployments without EVAL_GUARDRAIL_REGISTRY derive a legacy mock entry from EVAL_MOCK_GUARDRAIL_* variables for both existing provider IDs. Explicit registry configuration takes precedence and does not fall back if invalid. The sample registers the same test mock endpoint under both providers to preserve existing local evaluation configs; replace those entries with real provider instances for production.

Evaluation save and Trigger both resolve (provider, guardrail_id). A new run stores an immutable guardrail_connection snapshot with address and registry revision (no token value). The protected runner detail API uses the snapshot endpoint and resolves its credential reference at request time. Old runs without the snapshot use their saved target for compatibility. Secret rotation is supported; deleting a referenced credential causes a clear error. Old report inputs/results remain unchanged.

Local images: evaluation-ui:guardrail-registry-20261104, evaluation-worker:guardrail-registry-20261104. Mock image unchanged. Docker Hub tags are not updated by this deployment.


Verification (2026-11-04): 212 backend tests passed, 5 skipped; 3 frontend interaction tests passed; production build and docker compose config validation passed. Real configured-endpoint run eval-0198867926c8ceda43e1da4f completed 4 samples, TP/FP/TN/FN each 1, errors 0. Its run-context stores provider=f5, id=mock-guardrail, registry_revision=2f3ee4841f2e9200 and the configured endpoint, with no token value. Local K8s API/UI rollouts succeeded.
