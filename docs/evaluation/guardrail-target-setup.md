# Guardrail target setup

The UI chooses direct Guardrail evaluation by target.kind == GUARDRAIL, not by target ID.

1. Evaluation -> New target: set an ID, display name and provider. Current target catalog supports Guardrail targets.
2. Backend deployment: set EVAL_MOCK_GUARDRAIL_ID to the target Guardrail ID; set EVAL_MOCK_GUARDRAIL_URL to the Scan endpoint and provide EVAL_MOCK_GUARDRAIL_TOKEN through a Secret. The current connection resolver supports one configured mock connection, not arbitrary live providers.
3. Environments: select Model none. The Guardrail ID field is saved with the environment, but the direct Guardrail route resolves its connection from the selected target and backend connection configuration, not this field.
4. Datasets: publish a Guardrail dataset with input, label and strategy, a pinned Git classification scorer, label mapping and aspect.
5. Evaluation -> Trigger: choose the configured target, Guardrail datasets and a Model-none environment. POST guardrail-runs sets execution_mode=guardrail automatically.
6. New reports show TP/FP/TN/FN when binding_results are available. Existing generic reports are not converted.

A target ID without a configured connection is rejected explicitly. Renaming the target ID does not automatically rename the Mock service endpoint path.

## Dataset editor

Datasets -> Overview -> Evaluation type -> Guardrail classification exposes the pinned Git classification scorer/version, aspect ID/name and JSON label mapping. The Use Guardrail field schema action replaces draft fields with input/label/strategy; existing rows must be updated to match. Numeric labels need a number-typed label field and a matching mapping such as 0 -> safe, 1 -> unsafe. Save draft validates configuration, then Publish version makes it available in Trigger. The Scorers tab points Guardrail users to the single pinned scorer configuration in Overview. Existing published versions remain unchanged.

## Shared Guardrail connections

Evaluation target `id` identifies a unique evaluation configuration. Optional `guardrail_id` identifies its actual Guardrail connection and can be shared by multiple configurations. Old records without guardrail_id fall back to id. The target editor exposes both fields and supports editing the Guardrail ID with optimistic concurrency and a new target version. Each Trigger creates an independent run. Current connection resolution still supports one configured mock connection; guardrail_id must match EVAL_MOCK_GUARDRAIL_ID. Endpoint/token are configured on the backend, not stored in target documents.
