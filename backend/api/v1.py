from __future__ import annotations

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel
from backend.adapters.target_components import BuiltinTargetComponentCatalog


router = APIRouter(prefix="/api/v1")


def _services(request: Request):
    return request.app.state.workspace_service, request.app.state.evaluator_service


class StartEvaluationRequest(BaseModel):
    target_revision_id: str
    dataset_revision_id: str


class Payload(BaseModel):
    model_config = {"extra": "allow"}


class CasesPayload(BaseModel):
    cases: list[dict]


class GeneratePayload(BaseModel):
    count: int = 3


class ApplyAnalysisPayload(BaseModel):
    accepted_ids: list[str]


@router.get("/health")
def health(): return {"status": "ok"}


@router.get("/targets")
def targets(request: Request): return {"items": _services(request)[0].list_targets()}


@router.get("/tools")
def tools(): return {"items": BuiltinTargetComponentCatalog().list_kind("tool")}


@router.get("/mcps")
def mcps(): return {"items": BuiltinTargetComponentCatalog().list_kind("mcp")}


@router.get("/knowledge-bases")
def knowledge_bases(): return {"items": BuiltinTargetComponentCatalog().list_kind("kb")}


@router.post("/targets", status_code=status.HTTP_201_CREATED)
def create_target(payload: Payload, request: Request):
    return _services(request)[0].create_target(payload.model_dump())


@router.get("/targets/{item_id}")
def target(item_id: str, request: Request): return _services(request)[0].get_target(item_id)


@router.post("/targets/{item_id}/revisions", status_code=status.HTTP_201_CREATED)
def revise_target(item_id: str, payload: Payload, request: Request):
    return _services(request)[0].revise_target(item_id, payload.model_dump())


@router.get("/datasets")
def datasets(request: Request, target_id: str | None = Query(None)):
    return {"items": _services(request)[0].list_datasets(target_id)}


@router.post("/datasets", status_code=status.HTTP_201_CREATED)
def create_dataset(payload: Payload, request: Request):
    return _services(request)[0].create_dataset(payload.model_dump())


@router.get("/datasets/{item_id}")
def dataset(item_id: str, request: Request): return _services(request)[0].get_dataset(item_id)


@router.put("/datasets/{item_id}/cases")
def replace_cases(item_id: str, payload: CasesPayload, request: Request):
    return _services(request)[0].replace_cases(item_id, payload.cases)


@router.post("/datasets/{item_id}/generate")
def generate_cases(item_id: str, payload: GeneratePayload, request: Request):
    return _services(request)[0].generate_cases(item_id, payload.count)


@router.post("/datasets/{item_id}/publish", status_code=status.HTTP_201_CREATED)
def publish_dataset(item_id: str, request: Request):
    return _services(request)[0].publish_dataset(item_id)


@router.get("/evaluators")
def evaluators(request: Request): return {"items": _services(request)[1].list()}


@router.get("/evaluation-runs")
def evaluation_runs(request: Request, target_id: str | None = Query(None)):
    return {"items": _services(request)[0].list_runs(target_id)}


@router.post("/evaluation-runs", status_code=status.HTTP_202_ACCEPTED)
async def start_evaluation(payload: StartEvaluationRequest, request: Request):
    return await request.app.state.runner_service.start(
        payload.target_revision_id, payload.dataset_revision_id
    )


@router.get("/evaluation-runs/{item_id}")
def evaluation_run(item_id: str, request: Request): return _services(request)[0].get_run(item_id)


@router.get("/reports")
def reports(request: Request, target_id: str | None = Query(None)):
    return {"items": _services(request)[0].list_reports(target_id)}


@router.get("/reports/{item_id}")
def report(item_id: str, request: Request): return _services(request)[0].get_report(item_id)


@router.get("/analyses")
def analyses(request: Request): return {"items": _services(request)[0].list_analyses()}


@router.get("/analyses/{item_id}")
def analysis(item_id: str, request: Request): return _services(request)[0].get_analysis(item_id)


@router.post("/analyses/{item_id}/apply", status_code=status.HTTP_201_CREATED)
def apply_analysis(item_id: str, payload: ApplyAnalysisPayload, request: Request):
    return _services(request)[0].apply_analysis(item_id, tuple(payload.accepted_ids))
