from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.adapters.evaluators import BuiltinEvaluatorCatalog
from backend.adapters.evaluate_runner import PythonEvaluateRunnerAdapter
from backend.adapters.sqlite_workspace import SQLiteWorkspaceAdapter
from backend.api.v1 import router
from backend.errors import ApiError
from backend.ports import EvaluateRunnerPort
from backend.services import EvaluateRunnerService, EvaluatorService, WorkspaceService
from src.settings import load_settings
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_repository import WorkbenchRepository


def create_app(
    repository: WorkbenchRepository | None = None,
    runner: EvaluateRunnerPort | None = None,
) -> FastAPI:
    settings = load_settings(probe=False)
    durable_repository = repository or SQLiteWorkbenchRepository(settings.workbench_db)
    app = FastAPI(title="Eval Studio API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.workspace_service = WorkspaceService(SQLiteWorkspaceAdapter(durable_repository))
    app.state.evaluator_service = EvaluatorService(BuiltinEvaluatorCatalog())
    app.state.runner_service = EvaluateRunnerService(
        runner or _default_runner(durable_repository, settings)
    )

    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, error: ApiError):
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": error.code, "message": error.message, "details": error.details}},
        )

    app.include_router(router)
    return app


def _default_runner(repository: WorkbenchRepository, settings):
    """Compose current Python runners behind one replaceable API adapter."""
    from src.agent import TargetAgent
    from src.agent_adapter import PermissionAgentAdapter
    from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
    from src.code_evaluator import CodeEvaluator
    from src.config_loader import load_tools_config
    from src.demo_workspace import DEMO_AGENT_ID, DemoEvalRunner
    from src.eval_runner import EvalRunner
    from src.intent import build_intent_analyzer, build_llm_gateway
    from src.llm_judge import LlmJudge

    demo = DemoEvalRunner(repository, settings.data_dir / "demo-tool-traces.jsonl", inject_regression=True)
    configured = None
    if settings.anthropic_enabled or settings.openai_enabled:
        try:
            backend = LocalJsonBackend(settings.data_dir)
            store = LocalJsonStore(settings.data_dir)
            target = TargetAgent(load_tools_config(), backend.tracer, build_intent_analyzer(settings))
            configured = EvalRunner(
                repository,
                PermissionAgentAdapter(target, store),
                CodeEvaluator(),
                LlmJudge(build_llm_gateway(settings), backend.tracer),
            )
        except Exception:
            configured = None

    def resolve(revision_id: str):
        revision = repository.get_agent_revision(revision_id)
        return demo if revision.agent_id == DEMO_AGENT_ID else configured

    return PythonEvaluateRunnerAdapter(resolve)


app = create_app()
