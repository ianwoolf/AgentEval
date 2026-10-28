import json

import pytest

from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import RunStatus, TestCase as WorkbenchCase, ToolBinding


def binding(
    tool_id: str, *, enabled: bool = True, connection_type: str = "python"
) -> ToolBinding:
    return ToolBinding(
        tool_id,
        tool_id.title(),
        "",
        connection_type,
        {},
        {},
        {},
        {},
        ("Exercise the happy path",),
        False,
        enabled,
    )


def test_json_import_adds_reviewed_cases_without_replacing_the_draft(tmp_path):
    from src.ui.datasets import add_imported_cases

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(dataset_id, [WorkbenchCase("existing", {"query": "Existing"}, {})])

    added = add_imported_cases(
        registry,
        dataset_id,
        json.dumps(
            [
                {
                    "case_id": "imported",
                    "input": {"query": "Imported"},
                    "expected_output": {"answer": "ok"},
                    "tags": ["smoke"],
                }
            ]
        ),
    )

    assert [case.case_id for case in registry.list_draft(dataset_id)] == [
        "existing",
        "imported",
    ]
    assert added[0].tags == ("smoke",)


def test_json_import_rejects_non_array_payload(tmp_path):
    from src.ui.datasets import add_imported_cases

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")

    with pytest.raises(ValueError, match="JSON array"):
        add_imported_cases(DatasetRegistry(repository), dataset_id, '{"query": "x"}')


def test_run_readiness_lists_disabled_and_missing_tools():
    from src.ui.runs import unavailable_case_tools

    cases = (
        WorkbenchCase("one", {"query": "One"}, {"expected_tool_called": "weather"}),
        WorkbenchCase("two", {"query": "Two"}, {"expected_tool_called": "payments"}),
        WorkbenchCase("three", {"query": "Three"}, {"expected_tool_called": None}),
        WorkbenchCase("four", {"query": "Four"}, {"expected_tool_called": "mystery"}),
    )

    assert unavailable_case_tools(
        cases,
        (binding("weather", enabled=False), binding("mystery", connection_type="custom")),
    ) == (
        "mystery",
        "payments",
        "weather",
    )


def test_dataset_empty_state_exposes_all_add_actions(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    nodes = app.get("markdown") + app.get("text") + app.get("subheader")
    text = "\n".join(str(node.value) for node in nodes)
    assert "No questions yet" in text
    action_keys = {
        f"dataset_add_case_{agent.agent_id}_{dataset_id}",
        f"dataset_generate_llm_{agent.agent_id}_{dataset_id}",
        f"dataset_import_json_{agent.agent_id}_{dataset_id}",
    }
    assert {button.key for button in app.button} >= action_keys
    assert not {
        f"dataset_complete_coverage_{agent.agent_id}_{dataset_id}",
        f"dataset_publish_{agent.agent_id}_{dataset_id}",
    }.intersection({button.key for button in app.button})


def test_dataset_add_keeps_cases_visible_with_agent_scoped_actions(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {}, (binding("weather"),))
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    next(
        button
        for button in app.button
        if button.key == f"dataset_add_case_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)
    next(item for item in app.text_input if item.label == "Input").set_value("Created case")
    next(button for button in app.button if button.label == "Add").click().run(timeout=20)

    assert "Created case" in set(app.dataframe[0].value["Input"])
    assert set(app.dataframe[0].value["User role"]) == {"Guest"}
    assert all(
        "ALLOW · EXECUTE" in value
        for value in app.dataframe[0].value["Expected output"]
    )
    assert "Add question" not in {item.value for item in app.get("subheader")}
    assert [case.input["query"] for case in DatasetRegistry(repository).list_draft(dataset_id)] == [
        "Created case"
    ]


def test_dataset_llm_error_keeps_manual_and_json_actions_available(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

def unavailable_generator(agent_id, cases, request):
    raise RuntimeError("candidate provider unavailable")

render_datasets_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    unavailable_generator,
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(
        button
        for button in app.button
        if button.key == f"dataset_generate_llm_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)

    assert "Question generation failed: candidate provider unavailable" in "\n".join(
        str(node.value) for node in app.get("error")
    )
    buttons = {button.key: button for button in app.button}
    assert not buttons[f"dataset_add_case_{agent.agent_id}_{dataset_id}"].disabled
    assert not buttons[f"dataset_import_json_{agent.agent_id}_{dataset_id}"].disabled


def test_generated_questions_are_reviewed_in_a_table_and_appended(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {}, (binding("weather"),))
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("existing", {"query": "Existing question"}, {})]
    )
    script = f'''
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

def generator(agent_id, cases, request):
    return [
        {{"query": f"Generated: {{request}}", "tool_name": "WeatherTool", "metadata": {{"scenario": "normal_low"}}}},
        {{"query": "Generated two", "tool_name": "SystemRestartTool", "metadata": {{"scenario": "deny_no_permission"}}}},
    ]

render_datasets_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    generator,
)
'''
    app = AppTest.from_string(script).run(timeout=20)
    next(item for item in app.text_input if item.label == "Generation request").set_value(
        "Cover guest permissions"
    )
    next(
        button
        for button in app.button
        if button.key == f"dataset_generate_llm_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)

    assert not app.exception
    assert "Existing question" in set(app.dataframe[0].value["Input"])
    assert len(app.dataframe) == 2
    assert list(app.dataframe[1].value["Input"]) == [
        "Generated: Cover guest permissions",
        "Generated two",
    ]

    next(button for button in app.button if button.label == "Add questions").click().run(
        timeout=20
    )
    assert [case.input["query"] for case in DatasetRegistry(repository).list_draft(dataset_id)] == [
        "Existing question",
        "Generated: Cover guest permissions",
        "Generated two",
    ]


def test_dataset_dropdown_lists_and_selects_large_collections(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_ids = {}
    for index in range(45):
        name = f"Dataset {index:02d}"
        dataset_ids[name] = repository.create_dataset(agent.agent_id, name)
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    selector = next(
        item for item in app.selectbox if item.key == f"dataset_picker_{agent.agent_id}"
    )
    assert len(selector.options) == 45
    target_id = dataset_ids["Dataset 42"]
    app = selector.set_value(target_id).run(timeout=20)

    assert not app.exception
    assert app.session_state.selected_dataset_id == target_id


def test_dataset_case_list_renders_one_page_and_filters_large_drafts(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Large Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id,
        [
            WorkbenchCase(f"case-{index}", {"query": f"Case {index:02d}"}, {})
            for index in range(60)
        ],
    )
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.dataframe) == 1
    assert len(app.dataframe[0].value) == 25
    assert {button.label for button in app.button}.isdisjoint({"Edit", "Duplicate", "Delete"})
    assert {
        f"dataset_edit_selected_{agent.agent_id}_{dataset_id}",
        f"dataset_duplicate_selected_{agent.agent_id}_{dataset_id}",
        f"dataset_delete_selected_{agent.agent_id}_{dataset_id}",
    } <= {button.key for button in app.button}
    assert not next(
        button
        for button in app.button
        if button.key == f"dataset_case_next_{agent.agent_id}_{dataset_id}"
    ).disabled

    app = next(
        item
        for item in app.text_input
        if item.key == f"dataset_case_search_{agent.agent_id}_{dataset_id}"
    ).set_value("Case 59").run(timeout=20)

    assert not app.exception
    queries = set(app.dataframe[0].value["Input"])
    assert "Case 59" in queries
    assert "Case 00" not in queries


def test_dataset_catalog_creates_and_selects_a_new_dataset(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_dataset(agent.agent_id, "Existing")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)
    app = next(
        button for button in app.button if button.key == f"dataset_create_{agent.agent_id}"
    ).click().run(timeout=20)
    next(
        item for item in app.text_input if item.key == f"dataset_create_name_{agent.agent_id}"
    ).set_value("Checkout regression")
    app = next(button for button in app.button if button.label == "Create").click().run(timeout=20)

    assert not app.exception
    with repository._connect() as connection:
        names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM datasets WHERE agent_id = ?", (agent.agent_id,)
            ).fetchall()
        }
        new_dataset_ids = {
            row["dataset_id"]
            for row in connection.execute(
                "SELECT dataset_id FROM datasets WHERE name = 'Checkout regression'"
            ).fetchall()
        }
    assert names == {"Existing", "Checkout regression"}
    assert app.session_state.selected_dataset_id in new_dataset_ids


def test_evaluation_does_not_reuse_a_published_draft_for_a_different_draft_source(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    first_draft_id = repository.create_dataset(agent.agent_id, "First draft")
    second_draft_id = repository.create_dataset(agent.agent_id, "Second draft")
    registry = DatasetRegistry(repository)
    registry.add_cases(first_draft_id, [WorkbenchCase("first", {"query": "First"}, {})])
    registry.add_cases(second_draft_id, [WorkbenchCase("second", {"query": "Second"}, {})])
    script = f"""
from pathlib import Path
import streamlit as st
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module

class Runner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        repository = SQLiteWorkbenchRepository(Path({str(db)!r}))
        revision = repository.get_dataset_revision(dataset_revision_id)
        if revision.dataset_id != {second_draft_id!r}:
            raise AssertionError("The wrong draft was published")
        raise RuntimeError("selected draft verified")

st.session_state["selected_dataset_id"] = {second_draft_id!r}
render_runs_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r}, Runner())
"""
    app = AppTest.from_string(script).run(timeout=20)
    selected_label = next(select for select in app.selectbox if select.label == "Test set").value
    assert selected_label.startswith("draft:")

    app = next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    errors = "\n".join(str(node.value) for node in app.get("error"))
    assert "selected draft verified" in errors
    with repository._connect() as connection:
        published_ids = {
            row["dataset_id"]
            for row in connection.execute("SELECT dataset_id FROM dataset_revisions").fetchall()
        }
    assert published_ids == {second_draft_id}


def test_completed_evaluation_defers_judge_then_routes_from_see_result(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    completed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    script = f"""
from pathlib import Path
from src.report_service import ReportService
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    CompletedRunner(),
    ReportService(SQLiteWorkbenchRepository(Path({str(db)!r})), Path({str(tmp_path / 'reports')!r})),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)
    report = repository.list_reports(agent.agent_id)[0]

    assert app.session_state["active_page"] == "Agent"
    assert app.session_state["selected_report_id"] == report.report_id
    assert any(button.label == "See result" for button in app.button)
    page_text = "\n".join(str(node.value) for node in app.get("markdown"))
    assert "Test complete" in page_text
    assert "LLM as a judge" not in page_text
    assert "Needs review" not in page_text

    next(button for button in app.button if button.label == "See result").click().run(timeout=20)
    assert app.session_state["active_page"] == "Report"


def test_evaluation_does_not_route_to_a_report_that_was_not_persisted(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    completed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    script = f"""
from pathlib import Path
from types import SimpleNamespace
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

class NonPersistingReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id="not-persisted")

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    CompletedRunner(),
    NonPersistingReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert app.session_state["active_page"] == "Agent"
    assert "The result could not be saved." in "\n".join(
        str(node.value) for node in app.get("error")
    )


def test_evaluation_does_not_route_to_a_report_for_a_failed_persisted_run(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    failed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.FAILED,
    )
    persisted_report = repository.save_report(
        failed_run.run_id, "INCOMPLETE", {}, tmp_path / "failed-run-report.md"
    )
    script = f"""
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state
from src.workbench_models import RunStatus

class MisleadingRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        stored_run = SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({failed_run.run_id!r})
        return replace(stored_run, status=RunStatus.COMPLETED)

class PersistedReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id={persisted_report.report_id!r})

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    MisleadingRunner(),
    PersistedReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert app.session_state["active_page"] == "Agent"
    assert app.session_state["selected_run_id"] == failed_run.run_id
    assert "The result could not be saved." in "\n".join(
        str(node.value) for node in app.get("error")
    )


def test_evaluation_handles_a_persisted_report_with_a_missing_persisted_run(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    completed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    script = f"""
from pathlib import Path
from types import SimpleNamespace
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state

class DanglingReportRepository:
    def __init__(self, backing):
        self.backing = backing

    def get_report(self, report_id):
        return SimpleNamespace(report_id=report_id, run_id="missing-persisted-run")

    def get_run(self, run_id):
        if run_id == "missing-persisted-run":
            raise KeyError(run_id)
        return self.backing.get_run(run_id)

    def __getattr__(self, name):
        return getattr(self.backing, name)

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

class DanglingReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id="dangling-report")

init_ui_state({agent.agent_id!r})
render_runs_module(
    DanglingReportRepository(SQLiteWorkbenchRepository(Path({str(db)!r}))),
    {agent.agent_id!r},
    CompletedRunner(),
    DanglingReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert not app.exception
    assert app.session_state["active_page"] == "Agent"
    assert app.session_state["selected_run_id"] == completed_run.run_id
    assert "The result could not be saved." in "\n".join(
        str(node.value) for node in app.get("error")
    )
