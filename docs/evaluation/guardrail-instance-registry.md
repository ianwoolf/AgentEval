# Guardrail provider and instance registry

Choose the Provider and Instance in the Evaluation **Trigger** dialog. The dialog loads the current project registry from `GET /api/v1/evaluations/guardrail-instances`. Only enabled instances can start a run.

Open `/<project>/evaluation/admin/cleanup`, enter the management token, and select the **Guardrails** tab. Filter the instance table by Provider. Use **Add provider** to create a unique ID such as `production-guard`, or add and edit instances under an existing provider. Apply each edit and select **Save registry** to persist it in Elasticsearch. The registry is project-scoped and checks its revision before saving.

An instance requires an ID that is unique within its provider and the full HTTP(S) Scan endpoint. Optional settings include a display name, enabled status and TLS verification. Addresses must be free of embedded credentials, query strings and fragments. TLS verification defaults to on. New runs pin the address, TLS setting and registry revision at trigger time.

The JSON file named by `EVAL_GUARDRAIL_REGISTRY` supplies the initial configuration until the project saves its registry in Elasticsearch. For Kubernetes, the sample mounts the `evaluation-guardrails` ConfigMap at `/guardrails`. For Compose, it mounts `config/guardrails.json`. When neither a stored registry nor a JSON file is configured, the API supplies the built-in mock defaults.

All Scan calls use the shared `EVAL_GUARDRAIL_TOKEN` from the API environment or the secret file specified by `EVAL_GUARDRAIL_TOKEN_FILE`. Put the value in a Secret. Kubernetes examples reuse the `token` key of the existing `evaluation-mock-guardrail` Secret. Compose mounts `.secrets/guardrail_token` at `/run/secrets/guardrail_token`. Configure the same credential on each endpoint and the Mock when applicable. Legacy deployments can still use `EVAL_MOCK_GUARDRAIL_TOKEN` as a fallback during migration.

The runner retrieves the shared credential through its protected run detail endpoint. The registry and report snapshots contain endpoint metadata and never store the credential. Edits to the registry apply to new runs. A token rotation takes effect when the API next reads the shared credential.

For release `2.3.8`, use `ianwoolf/evaluation-worker:2.3.8` for both the API deployment and `EVAL_WORKER_IMAGE`. Deploy `ianwoolf/evaluation-ui:2.3.8` for the management tabs and `ianwoolf/evaluation-mock-guardrail:2.3.8` for the renamed credential. Apply the updated Kubernetes Job and Pod delete permissions in `evaluation-backend/deploy/kubernetes/services.yaml` if using the cleanup page.
