from fastapi.testclient import TestClient

from src.demo_workspace import seed_demo_workspace
from src.report_service import ReportService
from src.sqlite_workbench import SQLiteWorkbenchRepository


def _client(tmp_path, runner=None) -> TestClient:
    from backend.main import create_app

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    report_service = ReportService(repository, tmp_path / "reports")
    seed_demo_workspace(repository, report_service, tmp_path / "traces.jsonl")
    return TestClient(create_app(repository=repository, runner=runner))


def test_versioned_api_exposes_health_and_required_modules(tmp_path):
    """Deleting a module router must remove its observable API resource."""
    client = _client(tmp_path)

    assert client.get("/api/v1/health").json() == {"status": "ok"}
    for path in (
        "/targets",
        "/datasets",
        "/evaluators",
        "/evaluation-runs",
        "/reports",
        "/analyses",
    ):
        response = client.get(f"/api/v1{path}")
        assert response.status_code == 200, (path, response.text)
        assert isinstance(response.json()["items"], list)


def test_api_reads_existing_sqlite_workspace_through_module_services(tmp_path):
    """Replacing the adapter with empty data must hide the durable demo records."""
    client = _client(tmp_path)

    targets = client.get("/api/v1/targets").json()["items"]
    datasets = client.get("/api/v1/datasets").json()["items"]
    reports = client.get("/api/v1/reports").json()["items"]
    analyses = client.get("/api/v1/analyses").json()["items"]

    assert targets[0]["name"] == "Permission Compliance Agent"
    assert datasets[0]["name"] == "Permission Compliance Regression"
    assert reports[0]["target"]["name"] == "Permission Compliance Agent"
    assert analyses[0]["report_id"] == reports[0]["id"]
    assert "suggestions" in analyses[0]
    analysis = client.get(f"/api/v1/analyses/{reports[0]['id']}").json()
    assert "metrics" in analysis
    assert analysis["target"]["name"]


def test_apply_analysis_creates_a_new_target_revision(tmp_path):
    client = _client(tmp_path)
    analyses = client.get("/api/v1/analyses").json()["items"]
    analysis = next(item for item in analyses if item["suggestions"])
    before = analysis["target"]["revision"]
    suggestion_id = analysis["suggestions"][0]["suggestion_id"]

    response = client.post(
        f"/api/v1/analyses/{analysis['report_id']}/apply",
        json={"accepted_ids": [suggestion_id]},
    )

    assert response.status_code == 201
    assert response.json()["revision"] == before + 1


def test_api_uses_consistent_error_envelope(tmp_path):
    """Leaking framework exception shapes must break the public error contract."""
    client = _client(tmp_path)

    response = client.get("/api/v1/reports/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Resource 'missing' was not found",
            "details": {"resource_id": "missing"},
        }
    }


def test_evaluate_runner_endpoint_depends_on_replaceable_runner_port(tmp_path):
    """Hard-coding a concrete Python runner must break dependency injection."""
    class FakeRunner:
        async def run(self, target_revision_id: str, dataset_revision_id: str):
            return {
                "id": "run-new",
                "target_revision_id": target_revision_id,
                "dataset_revision_id": dataset_revision_id,
                "status": "QUEUED",
            }

    client = _client(tmp_path, runner=FakeRunner())
    response = client.post(
        "/api/v1/evaluation-runs",
        json={"target_revision_id": "target-r1", "dataset_revision_id": "dataset-r1"},
    )

    assert response.status_code == 202
    assert response.json() == {
        "id": "run-new",
        "target_revision_id": "target-r1",
        "dataset_revision_id": "dataset-r1",
        "status": "QUEUED",
    }


def test_python_runner_adapter_maps_domain_run_to_api_job(tmp_path):
    """Returning domain dataclasses directly must not leak Python implementation details."""
    from backend.adapters.evaluate_runner import PythonEvaluateRunnerAdapter
    from src.workbench_models import EvalRun, RunStatus

    class DomainRunner:
        async def run_revision(self, target_revision_id, dataset_revision_id):
            return EvalRun(
                "run-1", "target-1", target_revision_id, dataset_revision_id,
                RunStatus.COMPLETED, "start", "end", "v1", (),
            )

    adapter = PythonEvaluateRunnerAdapter(lambda _revision_id: DomainRunner())
    import asyncio
    result = asyncio.run(adapter.run("target-r1", "dataset-r1"))

    assert result == {
        "id": "run-1", "target_id": "target-1",
        "target_revision_id": "target-r1", "dataset_revision_id": "dataset-r1",
        "status": "COMPLETED", "started_at": "start", "completed_at": "end",
    }


def test_target_create_and_revise_preserve_immutable_revisions(tmp_path):
    client = _client(tmp_path)
    created = client.post("/api/v1/targets", json={
        "name": "Search quality", "description": "Search target",
        "config": {"model": "gpt-test", "prompt": "Be precise"},
        "tools": [{"tool_id": "search", "name": "Search", "description": "Lookup", "connection_type": "http"}],
    })
    assert created.status_code == 201
    target = created.json()
    assert target["revision"]["revision"] == 1
    assert target["revision"]["tools"][0]["name"] == "Search"

    revised = client.post(f"/api/v1/targets/{target['id']}/revisions", json={
        "config": {"model": "gpt-test", "prompt": "Use evidence"}, "tools": target["revision"]["tools"],
    })
    assert revised.status_code == 201
    assert revised.json()["revision"] == 2
    assert client.get(f"/api/v1/targets/{target['id']}").json()["revision"]["config_snapshot"]["prompt"] == "Use evidence"


def test_target_component_catalog_resolves_read_only_selections(tmp_path):
    client = _client(tmp_path)
    tools = client.get("/api/v1/tools")
    mcps = client.get("/api/v1/mcps")
    knowledge_bases = client.get("/api/v1/knowledge-bases")
    assert tools.status_code == mcps.status_code == knowledge_bases.status_code == 200
    assert {item["name"] for item in tools.json()["items"]}.issuperset(
        {"WeatherTool", "EmployeeQueryTool", "SystemRestartTool"}
    )
    assert all(item["kind"] == "tool" for item in tools.json()["items"])
    assert all(item["kind"] == "mcp" for item in mcps.json()["items"])
    assert all(item["kind"] == "kb" for item in knowledge_bases.json()["items"])

    chosen = [
        tools.json()["items"][0]["id"],
        mcps.json()["items"][0]["id"],
        knowledge_bases.json()["items"][0]["id"],
    ]
    created = client.post("/api/v1/targets", json={
        "name": "Catalog target", "description": "Read-only bindings",
        "config": {"model": "gpt-test", "prompt": "Use resources"},
        "component_ids": chosen,
    })
    assert created.status_code == 201
    tools = created.json()["revision"]["tools"]
    assert [tool["tool_id"] for tool in tools] == chosen
    assert [tool["connection_type"] for tool in tools] == ["tool", "mcp", "kb"]

    rejected = client.post("/api/v1/targets", json={
        "name": "Bad target", "config": {"model": "gpt-test"},
        "component_ids": ["unknown-resource"],
    })
    assert rejected.status_code == 400


def test_dataset_create_cases_generate_and_publish_contract(tmp_path):
    client = _client(tmp_path)
    target = client.get("/api/v1/targets").json()["items"][0]
    created = client.post("/api/v1/datasets", json={
        "target_id": target["id"], "name": "New cases", "description": "Regression",
        "columns": [
            {"name": "query", "kind": "input", "data_type": "string", "required": True},
            {"name": "header", "kind": "input", "data_type": "json", "required": False},
            {"name": "expected_action", "kind": "output", "data_type": "string", "required": True},
        ],
    })
    assert created.status_code == 201
    dataset_id = created.json()["id"]
    cases = [{"case_id": "one", "input": {"query": "Q", "header": {}}, "expected_output": {"expected_action": "A"}}]
    assert client.put(f"/api/v1/datasets/{dataset_id}/cases", json={"cases": cases}).status_code == 200
    generated = client.post(f"/api/v1/datasets/{dataset_id}/generate", json={"count": 2})
    assert generated.status_code == 200
    assert len(generated.json()["candidates"]) == 2
    published = client.post(f"/api/v1/datasets/{dataset_id}/publish")
    assert published.status_code == 201
    assert published.json()["revision"] == 1
    assert client.get(f"/api/v1/datasets/{dataset_id}").json()["cases"][0]["case_id"] == "one"
