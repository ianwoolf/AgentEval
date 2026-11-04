# Case concurrency

Environment `runner.concurrency` (integer 1–32, default 1) limits concurrent cases in one Runner process. One evaluation creates one Kubernetes Job with `parallelism: 1`, `completions: 1`, `backoffLimit: 0` and `restartPolicy: Never`.

The API loads the pinned environment version, records concurrency in the report snapshot and passes `EVAL_CONCURRENCY` to the worker. Guardrail execution preloads pinned Git scorer artifacts, then runs all datasets through one bounded ThreadPoolExecutor. Each task performs the Guardrail request and scoring. Each thread owns its HTTP client. The main thread alone persists sample results and updates dataset/run counters. IDs derive from dataset and row positions rather than completion order. Git artifact preparation is locked and cached within the process.

Changing an environment creates a new version. Update Evaluation configuration to use that version before Trigger. Existing Jobs and historical reports retain their original configuration. Concurrency controls active cases, not Pod count or requests per second. CPU and memory limits still apply to the whole execution Pod; Git subprocess scoring also consumes those resources.

Validation: 225 backend tests passed, 5 skipped. Added tests cover concurrency 1 and 3 across two datasets, one failing case, unique sample IDs, exact totals and main-thread persistence. API tests verify the environment value reaches EVAL_CONCURRENCY and Job parallelism/completions stay 1.
