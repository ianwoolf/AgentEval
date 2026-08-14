from __future__ import annotations

from backend.errors import ApiError
from backend.ports import EvaluateRunnerPort, EvaluatorCatalogPort, WorkspacePort


class WorkspaceService:
    def __init__(self, workspace: WorkspacePort): self.workspace = workspace
    def list_targets(self): return self.workspace.list_targets()
    def get_target(self, item_id: str): return self.workspace.get_target(item_id)
    def list_datasets(self, target_id: str | None = None): return self.workspace.list_datasets(target_id)
    def get_dataset(self, item_id: str): return self.workspace.get_dataset(item_id)
    def list_runs(self, target_id: str | None = None): return self.workspace.list_runs(target_id)
    def get_run(self, item_id: str): return self.workspace.get_run(item_id)
    def list_reports(self, target_id: str | None = None): return self.workspace.list_reports(target_id)
    def get_report(self, item_id: str): return self.workspace.get_report(item_id)
    def list_analyses(self): return self.workspace.list_analyses()
    def get_analysis(self, item_id: str): return self.workspace.get_analysis(item_id)
    def apply_analysis(self, item_id: str, accepted_ids): return self.workspace.apply_analysis(item_id, accepted_ids)
    def create_target(self, payload): return self.workspace.create_target(payload)
    def revise_target(self, item_id, payload): return self.workspace.revise_target(item_id, payload)
    def create_dataset(self, payload): return self.workspace.create_dataset(payload)
    def replace_cases(self, item_id, cases): return self.workspace.replace_cases(item_id, cases)
    def generate_cases(self, item_id, count): return self.workspace.generate_cases(item_id, count)
    def publish_dataset(self, item_id): return self.workspace.publish_dataset(item_id)


class EvaluatorService:
    def __init__(self, catalog: EvaluatorCatalogPort): self.catalog = catalog
    def list(self): return self.catalog.list_evaluators()


class EvaluateRunnerService:
    def __init__(self, runner: EvaluateRunnerPort | None): self.runner = runner

    async def start(self, target_revision_id: str, dataset_revision_id: str):
        if self.runner is None:
            raise ApiError(503, "runner_unavailable", "Evaluate Runner is not configured")
        return await self.runner.run(target_revision_id, dataset_revision_id)
