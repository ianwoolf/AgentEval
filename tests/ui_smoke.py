"""Headless smoke test for the persisted modular evaluation workflow."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streamlit.testing.v1 import AppTest

from src.agent_adapter import AgentAdapterResult
from src.agent_registry import AgentRegistry
from src.code_evaluator import CodeEvaluator
from src.dataset_registry import DatasetRegistry
from src.eval_runner import EvalRunner
from src.llm_judge import JudgeResult
from src.models import SpanRecord, TraceRecord
from src.report_service import ReportService
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase, ToolBinding, ToolEvidence, UsageCost


class FakeAgentAdapter:
    """Deterministic adapter used so the smoke test needs no provider keys."""

    async def run(self, case: TestCase, run_id: str) -> AgentAdapterResult:
        now = datetime.now(timezone.utc)
        trace = TraceRecord(
            f"trace-{run_id}-{case.case_id}",
            "fake-agent",
            spans=[SpanRecord("root", None, "agent_root", now)],
        )
        evidence = ToolEvidence(
            f"call-{case.case_id}", "lookup", True, True, True, True, False,
            {"query": case.input["query"]}, {"query": case.input["query"]},
            {"value": "ok"}, None, trace.trace_id, "observation-1", None, None,
            1.0, {"id": "receipt"},
        )
        return AgentAdapterResult(
            "fake answer", trace.trace_id, trace, (evidence,),
            (UsageCost("agent", "fake-agent", 10, 2, 0, 0, 0.01),),
        )


class FakeJudge:
    def evaluate(self, case, response, evidence, deterministic_scores):
        return JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {name: "Pass" for name in ("correctness", "relevance", "completeness", "safety")},
            "Pass", "fake-judge", "judge-v1", "judge-trace", "judge-observation",
            UsageCost("judge", "fake-judge", 4, 1, 0, 0, 0.005),
        )


class FixedEvaluator(CodeEvaluator):
    def __init__(self, passed: bool):
        self.passed = passed

    def evaluate(self, trace, expected):
        score = 1.0 if self.passed else 0.0
        return (
            {"permission_compliance": score, "execution_correctness": 1.0},
            {} if self.passed else {"permission_compliance": "MISSING_GUARD"},
        )


def binding(tool_id: str) -> ToolBinding:
    return ToolBinding(tool_id, tool_id, "", "python", {}, {}, {}, {}, (), False, True)


def visible_text(app: AppTest) -> str:
    nodes = app.get("title") + app.get("header") + app.get("subheader") + app.get("caption") + app.get("markdown")
    return "\n".join(str(node.value) for node in nodes)


def main() -> int:
    with tempfile.TemporaryDirectory(
        prefix="agent-eval-ui-smoke-", ignore_cleanup_errors=True
    ) as directory:
        root = Path(directory)
        repo = SQLiteWorkbenchRepository(root / "workbench.db")
        agents = AgentRegistry(repo)
        first = agents.create("Support Agent", "First smoke Agent")
        first_revision = agents.revise(first.agent_id, {"model": "fake-v1"}, (binding("lookup"),))
        second = agents.create("Ops Agent", "Second smoke Agent")
        agents.revise(second.agent_id, {"model": "fake-ops"}, (binding("restart"), binding("audit")))

        datasets = DatasetRegistry(repo)
        dataset_id = datasets.create(first.agent_id, "Support smoke Dataset")
        datasets.add_cases(dataset_id, [
            TestCase("manual-case", {"query": "Check account status"}, {"expected_tool_called": "lookup"}),
        ])
        dataset_revision = datasets.publish(dataset_id)

        first_run = asyncio.run(EvalRunner(
            repo, FakeAgentAdapter(), FixedEvaluator(True), FakeJudge(),
        ).run_revision(first_revision.revision_id, dataset_revision.revision_id))
        second_revision = agents.revise(first.agent_id, {"model": "fake-v2"}, (binding("lookup"),))
        second_run = asyncio.run(EvalRunner(
            repo, FakeAgentAdapter(), FixedEvaluator(False), FakeJudge(),
        ).run_revision(second_revision.revision_id, dataset_revision.revision_id))

        reports = ReportService(repo, root / "reports")
        first_report = reports.create(first_run.run_id)
        second_report = reports.create(second_run.run_id)
        comparison = reports.compare(first_report.report_id, second_report.report_id)
        assert comparison.shared_case_ids == ("manual-case",)
        assert comparison.regression_ids == ("manual-case",)

        script = f'''
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.reports import render_reports_module
render_reports_module(SQLiteWorkbenchRepository(Path({str(repo.db_path)!r})), {first.agent_id!r})
'''
        initial = AppTest.from_string(script).run(timeout=30)
        restarted = AppTest.from_string(script).run(timeout=30)
        assert not initial.exception, initial.exception
        assert not restarted.exception, restarted.exception
        text = visible_text(restarted)
        assert "NEEDS ATTENTION" in text
        assert "PASS" in text
        assert "Tool Evidence" in text
        assert "Usage & Cost" in text
        assert "Report history" in text

        previous_db = os.environ.get("WORKBENCH_DB")
        os.environ["WORKBENCH_DB"] = str(repo.db_path)
        try:
            demo = AppTest.from_file("app.py").run(timeout=30)
            assert not demo.exception, demo.exception
            assert "Demo Agent" in visible_text(demo)
            demo = next(
                radio for radio in demo.radio if radio.key == "active_page"
            ).set_value("Evaluation").run(timeout=30)
            demo = next(
                button for button in demo.button if button.key == "run_start"
            ).click().run(timeout=30)
            assert not demo.exception, demo.exception
            text = visible_text(demo)
            assert "NEEDS ATTENTION" in text
            assert "PASS" in text
            assert "FAIL" in text
            assert "Tool Evidence" in text
            assert "Usage & Cost" in text
            assert "Comparison" in text
        finally:
            if previous_db is None:
                os.environ.pop("WORKBENCH_DB", None)
            else:
                os.environ["WORKBENCH_DB"] = previous_db

    print("UI SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
