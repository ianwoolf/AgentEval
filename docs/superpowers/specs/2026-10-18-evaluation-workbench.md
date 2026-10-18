# Evaluation workbench UI design

Scope agreed: interactive UI demo only. No real sandbox, LLM calls, Guardrail interception, custom code execution, backend writes, or production guarantees. Every page identifies simulation and session-only state. Preserve Dashboard first under Observer.

Evaluation navigation: Eval, Datasets, Environments, Scorers, Reports. Keep catalog URL for Eval and existing legacy detail URLs. A project-scoped in-memory provider shares resources between the five pages; browser reload resets the demo. Changing projects resets the state.

Datasets are independent of targets: name, objective, description, tags, arbitrary JSON metadata, typed fields (input/reference/metadata), editable records, immutable published revisions. CSV/JSON/JSONL import has source preview, explicit field mapping, strict typed validation, and atomic append after confirmation. Reject invalid imports without partial writes. Preview bounded to 1000 rows / 2 MB.

Environments have only Sandbox type: versioned named configurations, deny-by-default network allowlist, read-only/read-write paths, process allowlist, CPU, memory, timeout. LLM and Guardrail interception are required conceptual evaluation proxy settings, clearly simulated, never claimed enforced.

Scorers: immutable built-ins and managed custom scorers. Custom LLM rubric or code definition, description, threshold, version notes; edit a draft, simulate a test, publish a new immutable version, deactivate/reactivate. Never execute pasted code. Old runs retain original versions and definitions.

Eval creation selects target (Prompt or Guardrail), published dataset revision, environment configuration, and multiple enabled published scorers. Review before running. Deterministic simulated running/completed states and cancellation. All resources are deep snapshot copies. Require at least one input field, nonempty published rows, and one scorer.

Reports: exact Evaluation ID search, target filtering, direct report navigation, aggregate pass rate/latency/cost, sample table with input/output/reference and per-scorer feedback. Sample drawer shows trace and score reasons. Configuration snapshot tab and JSON export. Historical results must not change when a resource is edited.

Acceptance: complete create/import/publish dataset → configure sandbox → publish scorer → create eval → open/filter report → inspect sample flow; fresh reload restores fixtures; existing Observer routes still work.

Integration deliverables: TypeScript resource contracts; proposed project-scoped REST endpoints, request/response examples, pagination/errors/version concurrency, execution event model, server security responsibilities, migration mapping from legacy API. Proposed v2 contracts are documentation, not shipped HTTP endpoints.

## Final fixture update

The default dataset is now `ds-guardrail` (Guardrail conversation safety), with six cases. Each case has `messages: [{role, content}]` (JSON input), `has_issue: boolean` (reference label; true means risk present), and optional `category` metadata. The label is not included in target input. Both seeded reports evaluate the Guardrail target. Classification reports show detected versus expected has_issue, false positives and false negatives. The simulator deliberately flips samples 3 and 5 to demonstrate missed risks and false alarms. See the integration handoff for schema limitations and backend validation responsibilities.
