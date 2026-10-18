# Evaluation Workbench Implementation Plan

**Goal:** Deliver the approved pure UI scope and actionable backend handoff.
**Architecture:** Isolated evaluation-workbench feature with typed contracts, pure import/model helpers, project-scoped React context, and five route views. Retain existing legacy evaluation components for their detail routes.
**Tech Stack:** Existing React, TanStack Router, shadcn/Radix, Vitest; no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-18-evaluation-workbench.md

## Tasks
- [x] Define contracts, fixture factory and immutable evaluation snapshots; test required resource validation and version preservation.
- [x] Implement CSV/JSON/JSONL parsing and explicit mapped typed validation; test quoted CSV, malformed input, missing required fields, wrong types and unknown mappings.
- [x] Add context and reusable form/table/dialog components; state lives only inside the project evaluation layout.
- [x] Build Datasets metadata/fields/data/version screens and atomic import preview.
- [x] Build versioned Sandbox configuration and built-in/custom scorer screens.
- [x] Build Eval creation/review/simulated progress/cancel and report detail/trace/export.
- [x] Wire five routes, sidebar and breadcrumbs; update navigation expectations.
- [x] Document proposed API, error and event models, backend responsibilities and demo limitations.
- [x] Run focused tests, TypeScript check, production build and browser smoke flow; inspect final diff.

## Review focus
Empty datasets cannot run; malformed import cannot mutate rows; new versions cannot mutate old results; duplicate submit cannot create duplicate runs; interrupted/cancelled runs never become completed. UI text must not imply real code execution, enforced security or durable storage.

## Final implementation record

- [x] Replace support-answer fixtures with six Guardrail conversation cases; separate messages input from has_issue reference labels.
- [x] Generate coherent simulated classification results and show false-positive/false-negative counts and per-case feedback.
- [x] Add fixture/schema/classification regression tests and update integration documentation.

Code commit: `a63c899` on `codex/tali-pre-guardrail-ui`, pushed to `ianwoolf/AgentEval`.
Final pre-push verification: Web workspace 448 tests passed (Control 421, example MCP 2, Runner 25), TypeScript passed. Run tests without TASKLATTICE_CONFIG; the dev config changes the expected public URL. SMTP integration tests require permission to bind a loopback port. Production build was verified during UI implementation, before the final Guardrail fixture update; the final update was verified by tests and TypeScript.
