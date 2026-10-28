from streamlit.testing.v1 import AppTest

from src.sqlite_workbench import SQLiteWorkbenchRepository


def visible_text(app: AppTest) -> str:
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("caption")
        + app.get("markdown")
        + app.get("text")
        + app.get("info")
        + app.get("warning")
        + app.get("error")
        + app.get("metric")
    )
    return "\n".join(str(node.value) for node in nodes)


def build_full_app(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    return AppTest.from_file("app.py").run(timeout=30), db


def test_app_starts_on_persisted_demo_agent_home(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)

    assert not app.exception
    text = visible_text(app)
    assert any("Demo Agent" in option for option in app.selectbox[0].options)
    assert "Latest result" in text
    assert "5/6" in text
    assert "+10%" in text
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Agent"

    repository = SQLiteWorkbenchRepository(db)
    agents = [agent for agent in repository.list_agents() if agent.current_revision > 0]
    assert len(agents) == 1
    assert len(repository.list_reports(agents[0].agent_id)) == 1


def test_demo_dataset_page_uses_dataset_context_and_nine_scenario_questions(
    tmp_path, monkeypatch
):
    app, _ = build_full_app(tmp_path, monkeypatch)
    app = next(radio for radio in app.radio if radio.key == "active_page").set_value(
        "Dataset"
    ).run(timeout=30)

    assert not app.exception
    text = visible_text(app)
    for label in ("AGENT", "Demo Agent", "CURRENT DATASET", "Test questions"):
        assert label in text
    assert "Search test sets" not in text
    assert len(app.dataframe) == 1
    assert len(app.dataframe[0].value) == 9
    assert set(app.dataframe[0].value["Scenario"]) == {
        "Low-risk request",
        "Allowed high-risk request",
        "Blocked: no permission",
        "Blocked: insufficient permission",
        "Permission bypass",
    }
    button_labels = {button.label for button in app.button}
    assert {"Generate questions", "Import questions"} <= button_labels
    assert button_labels.isdisjoint({"Fill gaps", "Save version"})


def test_home_run_check_reviews_test_cases_before_run(tmp_path, monkeypatch):
    app, _ = build_full_app(tmp_path, monkeypatch)

    app = next(button for button in app.button if button.key == "home_run_test").click().run(
        timeout=30
    )

    assert not app.exception
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Dataset"
    assert "Test questions" in visible_text(app)


def test_primary_demo_run_shows_completion_then_opens_result_report(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)
    app = next(radio for radio in app.radio if radio.key == "active_page").set_value(
        "Evaluation"
    ).run(timeout=30)
    assert "Test cases" in visible_text(app)
    case_table = next(frame.value for frame in app.dataframe if "Expected output" in frame.value)
    assert len(case_table) == 9
    detail_table = next(frame.value for frame in app.dataframe if "Detail" in frame.value)
    assert {"Tools covered", "Permission checks", "LLM Judge"} <= set(detail_table["Detail"])
    app = next(button for button in app.button if button.key == "run_start").click().run(
        timeout=30
    )

    assert not app.exception
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Evaluation"
    completion_text = visible_text(app)
    assert "Test complete" in completion_text
    assert "Test results" in completion_text
    assert "LLM as a judge" not in completion_text
    assert "Needs review" not in completion_text
    result_table = next(frame.value for frame in app.dataframe if "Result" in frame.value)
    assert len(result_table) == 9
    assert set(result_table["Result"]) == {"PASS", "FAIL"}
    app = next(button for button in app.button if button.label == "See result").click().run(
        timeout=30
    )

    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Report"
    text = visible_text(app)
    assert "Needs review" not in text
    assert "Summary" in text
    assert "Failed questions" in text
    assert "All questions" in text
    assert not any("LLM as a judge" in str(node.value) for node in app.get("markdown"))
    assert any(button.label == "LLM as judge" for button in app.button)
    assert "Tool activity" in text
    assert "AI scoring" in text

    repository = SQLiteWorkbenchRepository(db)
    agent = next(agent for agent in repository.list_agents() if agent.current_revision > 0)
    reports = repository.list_reports(agent.agent_id)
    assert len(reports) == 2
    assert reports[0].summary["metrics"]["passed_cases"] == 8
    assert reports[0].summary["metrics"]["pass_rate"] == 8 / 9 * 100

    app = next(button for button in app.button if button.label == "LLM as judge").click().run(
        timeout=30
    )
    judged_text = visible_text(app)
    assert "LLM as a judge" in judged_text
    assert "LLM Judge response" in judged_text
    assert "Reviewed inputs" in judged_text
    assert "Score breakdown" in judged_text
    for dimension in ("Correctness", "Relevance", "Completeness", "Safety"):
        assert dimension in judged_text
    assert len(SQLiteWorkbenchRepository(db).list_reports(agent.agent_id)) == 3


def test_reset_returns_home_without_deleting_report_history(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)
    app = next(radio for radio in app.radio if radio.key == "active_page").set_value(
        "Report"
    ).run(timeout=30)
    repository = SQLiteWorkbenchRepository(db)
    agent = next(agent for agent in repository.list_agents() if agent.current_revision > 0)
    report_count = len(repository.list_reports(agent.agent_id))

    app = next(button for button in app.button if button.key == "reset_demo").click().run(
        timeout=30
    )
    assert "Reset the sample view?" in visible_text(app)
    app = next(
        button for button in app.button if button.key == "confirm_reset_demo"
    ).click().run(timeout=30)

    assert not app.exception
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Agent"
    assert "Clear caches" not in visible_text(app)
    assert len(SQLiteWorkbenchRepository(db).list_reports(agent.agent_id)) == report_count
