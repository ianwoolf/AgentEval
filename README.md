# Eval Studio

Eval Studio is a local workbench for evaluating Agents against versioned
Datasets. It keeps Agents, Dataset Revisions, evaluation Runs, and Reports in
SQLite so that a result can be reopened and compared after restarting the app.

## Local startup

Prerequisites: Python 3.12+, Docker Desktop (only for local Langfuse), and an
installed project virtual environment.

1. Copy the environment template and configure the providers you want to use.

   ```powershell
   Copy-Item .env.example .env
   ```

   Set either DeepSeek's Anthropic-compatible values
   (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_MODEL`) or
   `OPENAI_API_KEY`. Configure `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
   and `LANGFUSE_HOST` when trace links should open in Langfuse. Empty provider
   keys keep the workbench usable with its local/demo adapters.

2. Optionally start the local Langfuse stack.

   ```powershell
   Copy-Item langfuse\.env.example langfuse\.env
   docker compose -f langfuse/docker-compose.yml up -d
   ```

   Langfuse is available at `http://localhost:3000`. Its Web and MinIO ports
   are bound to loopback for local use. Copy the local Langfuse credentials from
   `langfuse/.env.example` into `.env` and set `LANGFUSE_HOST=http://localhost:3000`.

3. Start the Python API backend.

   ```bash
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. Start the React and TypeScript frontend in a second terminal.

   ```bash
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

   Open `http://localhost:5173`. Vite proxies `/api` to FastAPI on port 8000.

The product UI no longer uses Streamlit. The Python evaluation core remains
behind FastAPI application ports and infrastructure adapters, allowing the
SQLite repository, runner, report generator, and analysis engine to be
replaced independently.

## Architecture

```text
frontend/                  React + TypeScript + Vite
  src/api/                 versioned REST client
  src/components/          reusable list/detail UI
backend/                   FastAPI boundary
  api/                     HTTP-only routers
  services.py              application use cases
  ports.py                 replaceable backend contracts
  adapters/                SQLite/evaluator implementations
src/                       Python evaluation domain and infrastructure
```

The `/api/v1` API exposes Target, Dataset, Evaluator, Evaluate Runner, Report,
and Analysis modules. OpenAPI documentation is at `http://localhost:8000/docs`.

## Demo flow

On startup, Eval Studio creates or reuses a durable **Permission Compliance
Agent** demo. No provider key or Langfuse connection is required.

1. **Agent** — select Permission Compliance Agent, review its three Target
   Tools, baseline Report, history, and trends.
2. **Dataset** — review the six cases in **Permission Compliance Regression**;
   optionally add a case manually, paste JSON, or generate an LLM draft for
   user review.
3. **Evaluation** — confirm the locked Agent/Dataset revisions and run the
   local deterministic evaluation.
4. **Report** — inspect Test Results first, followed by Tool Evidence, LLM
   Judge, historical Comparison, and finally Usage & Cost.
5. **Reset demo** — return to Agent Home without deleting Dataset revisions,
   Runs, or Report history.

The sample Report contains five correct outcomes and one intentionally injected
permission-bypass regression, making `PASS`, correctly blocked safety behavior,
and a genuine `FAIL` easy to distinguish.

Reports and revisions remain in SQLite after browser refreshes and service
restarts.

## Extended product flow

1. Create/import an Agent through the CLI, then select it on Agent Home.
2. Configure its Tools and save an immutable Agent Revision through the CLI.
3. Open Dataset for that Agent, add/import/generate cases, then publish a
   Dataset Revision.
4. Run an evaluation for one Agent Revision and one Dataset Revision.
5. Reopen the resulting Report at any time, then compare it with another
   Report. Comparisons call out configuration changes and shared-case deltas.

Costs remain separate so a Report makes the trade-offs clear:

- **Agent cost**: model usage while the Agent answers cases.
- **Judge cost**: model usage while the Judge scores answers.
- **Dataset cost**: model usage while cases are generated.
- **Evaluation total**: Agent plus Judge cost; Dataset generation is reported
  separately because it is not spent on every evaluation run.

LLM Dataset generation is optional. If the provider is unavailable, manual
case entry and JSON import remain available. Judge and Tool evidence are also
optional Report sections: when absent they display `Not available` and do not
change an otherwise passing Test Result.

## CLI

The stable-ID CLI is useful for scripted local demos. IDs printed by each
command are passed to the next command.

```powershell
.\.venv\Scripts\python.exe main.py agents list
.\.venv\Scripts\python.exe main.py agents import-legacy
.\.venv\Scripts\python.exe main.py datasets publish --dataset-id <dataset-id>
.\.venv\Scripts\python.exe main.py runs start --agent-revision-id <agent-revision-id> --dataset-revision-id <dataset-revision-id>
.\.venv\Scripts\python.exe main.py reports create --run-id <run-id>
.\.venv\Scripts\python.exe main.py reports compare --baseline <report-id> --current <report-id>
```

`main.py --step ...` remains temporarily for the original demo automation. It
prints a deprecation message and imports the legacy Agent before routing its
work through the stable records.

## Docker (optional)

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Docker Compose sets `WORKBENCH_DB=/app/data/workbench.db`; the
`agent-eval-data` named volume persists that SQLite database across `docker
compose down` and the next `docker compose up`. Do not use `down -v` unless you
intend to delete the local workbench data.

## Stopping local services

Stop both stacks while keeping their volumes:

```powershell
docker compose down
docker compose -f langfuse/docker-compose.yml down
```

## Verification

```bash
python -m pytest -q
npm --prefix frontend test
npm --prefix frontend run build
docker compose config
docker compose -f langfuse\docker-compose.yml config
```
