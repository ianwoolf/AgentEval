from __future__ import annotations

from dataclasses import asdict
from typing import Any

from src.report_reflection import RuleBasedReportReflector, create_reflected_revision
from src.agent_registry import AgentRegistry
from src.dataset_registry import DatasetRegistry
from src.workbench_models import DatasetColumn, DatasetSchema, TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from backend.errors import not_found
from backend.adapters.target_components import BuiltinTargetComponentCatalog


def _plain(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_plain(item) for item in value]
    return value


class SQLiteWorkspaceAdapter:
    """Expose durable workspace records without leaking SQLite to services."""

    def __init__(self, repository: WorkbenchRepository):
        self.repository = repository

    def list_targets(self) -> list[dict[str, Any]]:
        return [self._target(item.agent_id) for item in self.repository.list_agents()]

    def _target(self, target_id: str) -> dict[str, Any]:
        target = self.repository.get_agent(target_id)
        revision = self.repository.get_current_agent_revision(target_id)
        return {
            "id": target.agent_id,
            "name": target.name,
            "description": target.description,
            "current_revision": target.current_revision,
            "created_at": target.created_at,
            "revision": _plain(asdict(revision)) if revision else None,
        }

    def get_target(self, target_id: str) -> dict[str, Any]:
        try:
            return self._target(target_id)
        except KeyError:
            raise not_found(target_id)

    def list_datasets(self, target_id: str | None = None) -> list[dict[str, Any]]:
        targets = [self.repository.get_agent(target_id)] if target_id else self.repository.list_agents()
        rows: list[dict[str, Any]] = []
        connect = getattr(self.repository, "_connect", None)
        if connect is None:
            return rows
        for target in targets:
            with connect() as connection:
                datasets = connection.execute(
                    "SELECT dataset_id, name, description, current_revision, created_at, "
                    "(SELECT revision_id FROM dataset_revisions r WHERE r.dataset_id=datasets.dataset_id "
                    "AND r.revision=datasets.current_revision) AS current_revision_id "
                    "FROM datasets WHERE agent_id = ? ORDER BY created_at DESC",
                    (target.agent_id,),
                ).fetchall()
            for dataset in datasets:
                rows.append({
                    "id": dataset["dataset_id"], "target_id": target.agent_id,
                    "target_name": target.name, "name": dataset["name"],
                    "description": dataset["description"],
                    "current_revision": dataset["current_revision"],
                    "current_revision_id": dataset["current_revision_id"],
                    "created_at": dataset["created_at"],
                    "case_count": len(self.repository.list_draft_cases(dataset["dataset_id"])),
                })
        return rows

    def get_dataset(self, dataset_id: str) -> dict[str, Any]:
        item = next((row for row in self.list_datasets() if row["id"] == dataset_id), None)
        if item is None:
            raise not_found(dataset_id)
        return {
            **item,
            "schema": _plain(asdict(self.repository.get_dataset_schema(dataset_id))),
            "cases": [_plain(asdict(case)) for case in self.repository.list_draft_cases(dataset_id)],
        }

    def list_runs(self, target_id: str | None = None) -> list[dict[str, Any]]:
        targets = [self.repository.get_agent(target_id)] if target_id else self.repository.list_agents()
        return [
            self._run(run.run_id)
            for target in targets
            for run in self.repository.list_runs(target.agent_id)
        ]

    def _run(self, run_id: str) -> dict[str, Any]:
        run = self.repository.get_run(run_id)
        target = self.repository.get_agent(run.agent_id)
        return {
            "id": run.run_id, "target": {"id": target.agent_id, "name": target.name},
            "target_revision_id": run.agent_revision_id,
            "dataset_revision_id": run.dataset_revision_id,
            "status": run.status.value, "started_at": run.started_at,
            "completed_at": run.completed_at, "case_count": len(run.case_results),
        }

    def get_run(self, run_id: str) -> dict[str, Any]:
        try:
            return self._run(run_id)
        except KeyError:
            raise not_found(run_id)

    def list_reports(self, target_id: str | None = None) -> list[dict[str, Any]]:
        targets = [self.repository.get_agent(target_id)] if target_id else self.repository.list_agents()
        return [
            self._report(report.report_id)
            for target in targets
            for report in self.repository.list_reports(target.agent_id)
        ]

    def _report(self, report_id: str) -> dict[str, Any]:
        report = self.repository.get_report(report_id)
        run = self.repository.get_run(report.run_id)
        target = self.repository.get_agent(run.agent_id)
        return {
            "id": report.report_id, "run_id": report.run_id,
            "target": {"id": target.agent_id, "name": target.name},
            "status": report.status, "artifact_version": report.artifact_version,
            "summary": _plain(report.summary), "created_at": report.created_at,
        }

    def get_report(self, report_id: str) -> dict[str, Any]:
        try:
            return self._report(report_id)
        except KeyError:
            raise not_found(report_id)

    def get_analysis(self, report_id: str) -> dict[str, Any]:
        try:
            report = self.repository.get_report(report_id)
            run = self.repository.get_run(report.run_id)
            revision = self.repository.get_agent_revision(run.agent_revision_id)
        except KeyError:
            raise not_found(report_id)
        suggestions = RuleBasedReportReflector().reflect(report, revision)
        target = self.repository.get_agent(revision.agent_id)
        metrics = _plain(report.summary.get("metrics", {}))
        return {
            "report_id": report.report_id,
            "target": {"id": revision.agent_id, "name": target.name, "revision": revision.revision},
            "status": report.status,
            "metrics": metrics,
            "suggestions": [_plain(asdict(item)) for item in suggestions],
            "created_at": report.created_at,
        }

    def list_analyses(self) -> list[dict[str, Any]]:
        return [self.get_analysis(report["id"]) for report in self.list_reports()]

    def apply_analysis(self, report_id: str, accepted_ids: tuple[str, ...]) -> dict[str, Any]:
        analysis = self.get_analysis(report_id)
        revision = create_reflected_revision(
            self.repository, analysis["target"]["id"], report_id, accepted_ids
        )
        return _plain(asdict(revision))

    @staticmethod
    def _tool(payload: dict[str, Any]) -> ToolBinding:
        return ToolBinding(
            payload["tool_id"], payload.get("name", payload["tool_id"]), payload.get("description", ""),
            payload.get("connection_type", "http"), payload.get("adapter_config", {}),
            payload.get("input_schema", {}), payload.get("output_schema", {}),
            payload.get("permission", {}), tuple(payload.get("test_requirements", ())),
            bool(payload.get("verification_required", False)), bool(payload.get("enabled", True)),
        )

    def create_target(self, payload: dict[str, Any]) -> dict[str, Any]:
        tools = payload.get("tools")
        if "component_ids" in payload:
            tools = BuiltinTargetComponentCatalog().resolve(payload["component_ids"])
        target, _revision = AgentRegistry(self.repository).create_revision(
            payload["name"], payload.get("description", ""), payload.get("config", {}),
            tuple(self._tool(item) for item in tools or ()),
        )
        return self._target(target.agent_id)

    def revise_target(self, target_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        tools = payload.get("tools")
        if "component_ids" in payload:
            tools = BuiltinTargetComponentCatalog().resolve(payload["component_ids"])
        revision = AgentRegistry(self.repository).revise(
            target_id, payload.get("config", {}),
            tuple(self._tool(item) for item in tools or ()),
        )
        return _plain(asdict(revision))

    def create_dataset(self, payload: dict[str, Any]) -> dict[str, Any]:
        schema = DatasetSchema(tuple(DatasetColumn(**item) for item in payload["columns"]))
        dataset_id = DatasetRegistry(self.repository).create(
            payload["target_id"], payload["name"], description=payload.get("description", ""), schema=schema,
        )
        return self.get_dataset(dataset_id)

    def replace_cases(self, dataset_id: str, cases: list[dict[str, Any]]) -> dict[str, Any]:
        parsed = [TestCase(
            item["case_id"], item.get("input", {}), item.get("expected_output", {}),
            item.get("reference_answer"), tuple(item.get("tags", ())), item.get("source", "manual"),
            item.get("metadata", {}),
        ) for item in cases]
        DatasetRegistry(self.repository)._replace_validated(dataset_id, parsed)
        return self.get_dataset(dataset_id)

    def generate_cases(self, dataset_id: str, count: int) -> dict[str, Any]:
        schema = self.repository.get_dataset_schema(dataset_id)
        current = self.repository.list_draft_cases(dataset_id)
        candidates = []
        for offset in range(max(1, min(count, 10))):
            index = len(current) + offset + 1
            input_values = {}
            output_values = {}
            for column in schema.columns:
                value: Any = {} if column.data_type == "json" else False if column.data_type == "boolean" else index if column.data_type == "number" else f"Generated {column.name} {index}"
                (input_values if column.kind == "input" else output_values)[column.name] = value
            candidates.append({
                "case_id": f"generated-{index}", "input": input_values,
                "expected_output": output_values, "source": "generated", "tags": ["generated"],
            })
        return {"candidates": candidates, "provider": "local-fallback"}

    def publish_dataset(self, dataset_id: str) -> dict[str, Any]:
        return _plain(asdict(DatasetRegistry(self.repository).publish(dataset_id)))
