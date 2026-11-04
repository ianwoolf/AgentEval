# Guardrail report metrics

The report projection computes metrics from all persisted sample evidence (independent of response pagination). Overall scores are micro-averages from summed TP/FP/TN/FN, not arithmetic means of dataset percentages. Positive means unsafe. Precision=TP/(TP+FP), recall=TP/(TP+FN), accuracy=(TP+TN)/classified, F1=2TP/(2TP+FP+FN). A zero denominator is null/N/A. Execution errors are shown separately and excluded from classification denominators; pending requests are not fabricated as classifications. Duplicate request IDs are counted once.

Dataset results group run-owned bindings by dataset ID and pinned version, retaining names from the run snapshot. Average/P50/P95 latency uses actual sent Guardrail HTTP calls (including failed calls); it excludes Git checkout and scoring. Percentiles use nearest rank. Empty latency populations return null.

GET /reports/{experiment_id} adds overall, dataset_results and guardrail (type/provider/id/name/registry_revision). Guardrail identity comes from the persisted run connection/target snapshot, not the current instance registry. Old runs fall back to their saved target. No credentials are returned. Existing records need no migration.

GET /guardrail-reports lists project-scoped persisted Guardrail report choices, including status and instance identity. The UI excludes the current report. Comparison fetches another full report projection and shows the four overall metrics and current-minus-reference differences in percentage points. Different datasets/scorers/versions can affect comparability; in-progress metrics are provisional.

UI: four overall score cards, per-dataset summary table, grouped all-metric bars or single-metric comparison or table-only mode; latency comparison with Average/P50/P95; selectable reference report. Existing per-aspect detail and request input/output drill-down remain available. Cost remains mock.

Local images: evaluation-ui:report-metrics-20261104, evaluation-worker:report-metrics-20261104. Mock image unchanged. Docker Hub 2.3.3 is not overwritten.


Verification (2026-11-04): 215 backend tests passed, 5 skipped; 2 UI tests passed for score/latency view switching, report comparison deltas, N/A and zero values. Build passed. Deployed API/UI rollouts succeeded. Existing two-dataset report exp-412083be0fb5a34d7fd9b543c9d22dfc returns 8 processed samples even with limit=1, all four overall metrics .5, two independent latency populations of 4 calls each. Guardrail identity for exp-3d2f2b7113806d0643e4d31482e6c273 comes from the saved f5/mock-guardrail connection and registry revision. Comparison list returned 14 persisted report choices at verification time.


Score chart refinement: vertical grouped columns use metric categories (Precision/Recall/Accuracy/F1) on the x-axis, fixed 0-100% y-axis, and one consistently colored series per dataset. Each metric group contains every dataset. Single-metric mode uses the same vertical chart. Duplicate dataset display names are disambiguated with IDs; many datasets permit horizontal scrolling and hover titles. Latency chart remains unchanged.


Compact report refinement: score chart height is fixed around 210px; overall cards are smaller, formulas fold under Metric definitions, and aspect breakdown is collapsed by default. Latency displays dataset/count/Average/P50/P95 in one compact table instead of proportional long bars. All statistics and request drill-down remain available.


Inline report comparison refinement: overall card differences are current minus selected in percentage points, green for positive, red for negative, neutral for zero, N/A for undefined denominators. The separate overall comparison table is removed. Dataset pairing requires identical (dataset_id, dataset_version) sets, independent of ordering. Matching datasets share one grouped metric chart with paired Current/Selected bars (same dataset color, selected translucent) and per-dataset table deltas. If ID/version sets differ, current and selected reports use separate charts and tables rather than a false alignment.


Aspect label refinement: metric group titles appear at the top; every bar has its dataset name below, wrapped across two lines, plus Current/Selected when comparing. Full names/versions are retained in tooltips. Many datasets use horizontal scrolling to keep column labels readable. scripts/seed_guardrail_aspects.py publishes eight named synthetic aspect datasets independently of scorers.
