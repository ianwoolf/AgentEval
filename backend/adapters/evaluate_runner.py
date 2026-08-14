from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol


class RevisionRunner(Protocol):
    async def run_revision(self, target_revision_id: str, dataset_revision_id: str): ...


class PythonEvaluateRunnerAdapter:
    """Translate the current Python runner contract into the backend Runner port."""

    def __init__(self, resolve: Callable[[str], RevisionRunner | None]):
        self.resolve = resolve

    async def run(self, target_revision_id: str, dataset_revision_id: str) -> dict[str, Any]:
        from backend.errors import ApiError

        runner = self.resolve(target_revision_id)
        if runner is None:
            raise ApiError(503, "runner_unavailable", "No Evaluate Runner is configured for this Target")
        run = await runner.run_revision(target_revision_id, dataset_revision_id)
        return {
            "id": run.run_id,
            "target_id": run.agent_id,
            "target_revision_id": run.agent_revision_id,
            "dataset_revision_id": run.dataset_revision_id,
            "status": run.status.value,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
        }
