# AgentEval

AgentEval is a local workbench for evaluating Agents against versioned test
cases. The TALI control console is the project's only Web UI; the Python code
provides the evaluation API, CLI, adapters, and SQLite persistence.

## Runtime architecture

| Service | Default address | Storage | Purpose |
| --- | --- | --- | --- |
| TALI Web | `http://127.0.0.1:18082` | PostgreSQL | Authentication, projects, and the control-console shell |
| AgentEval API | `http://127.0.0.1:8000` | `data/web-workbench.db` | Targets, datasets, runs, reports, and demo fixtures |
| AgentEval CLI | local process | `data/workbench.db` | Scripted evaluation and report workflows |

The TALI server reverse-proxies `/api/v1/evaluations/*` to the Python API.
PostgreSQL and the AgentEval SQLite databases have separate responsibilities
and should not be pointed at the same file or volume.

## Quick start with Docker

Prerequisites: Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://127.0.0.1:18082` and sign in with `admin` / `admin`. The API is
available at `http://127.0.0.1:8000/docs`.

Docker Compose starts PostgreSQL, the AgentEval FastAPI service, and the TALI
Web service. The Web container applies Prisma migrations before it starts.

## Local development

Prerequisites: Python 3.12+, Node.js 22+, npm, Docker Desktop, and a project
virtual environment.

Install dependencies once:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Set-Location web
npm ci
Set-Location ..
```

Start PostgreSQL, the API, and the TALI development server:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

The script resolves paths from its own location, creates or reuses the local
`tasklattice-dev-postgres` container, applies database migrations, starts the
API on port `8000`, and runs TALI on port `18082`.

## TALI evaluation demo

Open `/individual/evaluation/catalog` for the interactive evaluation workbench.
The Evaluation sidebar contains **Eval, Datasets, Environments, Scorers, Reports**;
**Dashboard** is the first item under Observer.

- Datasets have independent objectives, metadata, typed fields, CSV/JSON/JSONL
  import with mapping/validation, editable records, and published versions.
- Sandbox configurations expose network, filesystem, process and resource limits,
  plus the intended LLM/Guardrail interception paths.
- Built-in and custom scorers can be selected for an evaluation; custom scorers
  support drafts, simulated tests, version upgrades and enabling/disabling.
- Eval combines a Prompt/Guardrail target, dataset version, sandbox configuration
  and scorers. Reports support Evaluation ID/target filters, sample feedback,
  traces, configuration snapshots and JSON export.

This is **pure UI simulation**: no sandbox is launched, no traffic is intercepted,
no scorer code runs, and no model provider is contacted. Changes live only while
this project's Evaluation layout remains mounted; refreshing, leaving that layout,
or switching projects resets the fixtures. Save a dataset draft before leaving its
editor. Published versions and evaluation snapshots remain immutable in-session.

For a fresh machine, start with the [development handoff](docs/evaluation/development-handoff.md).

See [UI and backend integration handoff](docs/evaluation/ui-integration.md) for
contracts, proposed v2 endpoints, version/concurrency rules, execution events,
backend responsibilities, limitations and a walkthrough. These proposed APIs are
not implemented by this demo. Legacy detail pages and Dashboard/Traces retain
their separate fixture store; the Python API remains available for future wiring.

## CLI

IDs printed by each command are passed to the next command:

```powershell
.\.venv\Scripts\python.exe main.py agents list
.\.venv\Scripts\python.exe main.py agents import-legacy
.\.venv\Scripts\python.exe main.py datasets publish --dataset-id <dataset-id>
.\.venv\Scripts\python.exe main.py runs start --agent-revision-id <agent-revision-id> --dataset-revision-id <dataset-revision-id>
.\.venv\Scripts\python.exe main.py reports create --run-id <run-id>
.\.venv\Scripts\python.exe main.py reports compare --baseline <report-id> --current <report-id>
```

`main.py --step ...` remains temporarily for the original demo automation. It
prints a deprecation message and routes the work through the stable records.

## Optional Langfuse stack

```powershell
Copy-Item langfuse\.env.example langfuse\.env
docker compose -f langfuse\docker-compose.yml up -d
```

Langfuse is available at `http://localhost:3000`. Configure
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in `.env` when
trace links should open in Langfuse.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular

Set-Location web
npm.cmd run build --workspace "@tasklattice/contracts"
node node_modules\typescript\bin\tsc -p apps\control\tsconfig.json --noEmit
npm.cmd test --workspace "@tasklattice/control"
npm.cmd run build:control
Set-Location ..

docker compose config
```

## Stopping services

```powershell
docker compose down
docker compose -f langfuse\docker-compose.yml down
```

Volumes are retained across `docker compose down`. Do not add `-v` unless you
intend to delete the local PostgreSQL and AgentEval data.
