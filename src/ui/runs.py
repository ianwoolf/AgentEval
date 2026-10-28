"""Contextual immutable-run wizard and Agent-scoped run history."""
from __future__ import annotations

import asyncio
import inspect
from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd
import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.workbench_models import DatasetRevision, EvalRun, RunStatus, TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from .state import request_navigation


_KNOWN_ADAPTERS = {"python", "http", "mock", "langfuse", "agent"}


def unavailable_case_tools(
    cases: Sequence[TestCase], tools: Sequence[ToolBinding]
) -> tuple[str, ...]:
    """Return stable IDs/names of required Tools that cannot be executed."""
    available: set[str] = set()
    unavailable: set[str] = set()
    known: set[str] = set()
    for tool in tools:
        aliases = {tool.tool_id.casefold(), tool.name.casefold()}
        known.update(aliases)
        if tool.enabled and tool.connection_type in _KNOWN_ADAPTERS:
            available.update(aliases)
        else:
            unavailable.add(tool.tool_id)
    for case in cases:
        required = case.expected_output.get("expected_tool_called")
        if required in (None, ""):
            continue
        name = str(required)
        folded = name.casefold()
        if folded not in available:
            if folded in known:
                matching = next(
                    (tool.tool_id for tool in tools if folded in {tool.tool_id.casefold(), tool.name.casefold()}),
                    name,
                )
                unavailable.add(matching)
            else:
                unavailable.add(name)
    return tuple(sorted(unavailable))


def _rows(repository: WorkbenchRepository, query: str, values: tuple[Any, ...]) -> list[dict[str, Any]]:
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return []
    with connect() as connection:
        rows = connection.execute(query, values).fetchall()
    return [dict(row) for row in rows]


def _dataset_revisions(repository: WorkbenchRepository, agent_id: str) -> list[DatasetRevision]:
    rows = _rows(
        repository,
        "SELECT revision_id FROM dataset_revisions WHERE agent_id = ? ORDER BY created_at DESC, revision DESC",
        (agent_id,),
    )
    return [repository.get_dataset_revision(row["revision_id"]) for row in rows]


def _draft_options(repository: WorkbenchRepository, agent_id: str) -> list[dict[str, Any]]:
    return _rows(
        repository,
        "SELECT datasets.dataset_id, datasets.name, COUNT(dataset_draft_cases.case_id) AS case_count "
        "FROM datasets LEFT JOIN dataset_draft_cases USING (dataset_id) "
        "WHERE datasets.agent_id = ? GROUP BY datasets.dataset_id, datasets.name "
        "HAVING COUNT(dataset_draft_cases.case_id) > 0 ORDER BY datasets.created_at",
        (agent_id,),
    )


def _run_result(value: Any) -> EvalRun:
    if inspect.isawaitable(value):
        return asyncio.run(value)
    return value


def _expected_output_label(case: TestCase) -> str:
    expected = case.expected_output
    decision = str(expected.get("permission_decision") or "ALLOW").upper()
    execution = str(
        expected.get("tool_execution")
        or ("EXECUTE" if decision == "ALLOW" else "BLOCK")
    ).upper()
    tool = str(
        expected.get("target_tool")
        or expected.get("expected_tool_called")
        or case.metadata.get("tool_name")
        or "No tool"
    )
    return f"{decision} · {execution} · {tool}"


def _case_rows(
    cases: Sequence[TestCase],
    results: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, case in enumerate(cases, start=1):
        row = {
            "#": index,
            "Input": str(case.input.get("query") or ""),
            "User role": str(case.input.get("user_role") or "user").title(),
            "Expected output": _expected_output_label(case),
        }
        if results is not None:
            result = results.get(case.case_id)
            row["Result"] = str(result.status) if result is not None else "INCOMPLETE"
        rows.append(row)
    return rows


def _result_style(value: str) -> str:
    if value == "PASS":
        return "color: #176B55; font-weight: 750"
    if value == "FAIL":
        return "color: #B3261E; font-weight: 750"
    return "color: #485B55; font-weight: 700"


def _render_test_cases(
    cases: Sequence[TestCase],
    results: Mapping[str, Any] | None = None,
) -> None:
    rows = pd.DataFrame(_case_rows(cases, results))
    if results is None:
        st.dataframe(rows, width="stretch", hide_index=True)
    else:
        st.dataframe(
            rows.style.map(_result_style, subset=["Result"]),
            width="stretch",
            hide_index=True,
        )


def _quality_and_costs(repository: WorkbenchRepository, agent_id: str) -> dict[str, tuple[str, float]]:
    result: dict[str, tuple[str, float]] = {}
    for report in repository.list_reports(agent_id):
        if report.run_id in result:
            continue
        costs = report.summary.get("costs", {})
        result[report.run_id] = (
            str(report.summary.get("status", report.status)),
            float(costs.get("evaluation_total", 0.0)),
        )
    return result


def _render_run_history(repository: WorkbenchRepository, agent_id: str) -> None:
    runs = repository.list_runs(agent_id)
    st.markdown("#### Previous tests")
    if not runs:
        st.caption("No previous tests.")
        return
    report_data = _quality_and_costs(repository, agent_id)
    for run in runs:
        agent_revision = repository.get_agent_revision(run.agent_revision_id)
        dataset_revision = repository.get_dataset_revision(run.dataset_revision_id)
        quality, cost = report_data.get(run.run_id, ("INCOMPLETE", 0.0))
        with st.container(border=True):
            identity, states, amount = st.columns([3.2, 2, 1.2])
            identity.markdown(f"**{run.started_at}**")
            identity.caption(f"{dataset_revision.name} · version {dataset_revision.revision}")
            states.markdown(f"**{quality}**")
            states.caption(run.status.value.title())
            amount.metric("Cost", f"${cost:.4f}")


def _render_test_completion(repository: WorkbenchRepository, agent_id: str) -> None:
    completion_key = f"run_completed_report_{agent_id}"
    report_id = st.session_state.get(completion_key)
    if not report_id:
        return
    try:
        report = repository.get_report(str(report_id))
        run = repository.get_run(report.run_id)
    except KeyError:
        st.session_state.pop(completion_key, None)
        return
    if run.agent_id != agent_id:
        st.session_state.pop(completion_key, None)
        return
    counts = report.summary.get("metrics", {})
    total = int(counts.get("total_cases", 0))
    passed_count = int(counts.get("passed_cases", 0))
    failed_count = max(total - passed_count, 0)
    passed = failed_count == 0
    background = "#E4F0E9" if passed else "#FCE8E6"
    color = "#176B55" if passed else "#B3261E"
    icon = "✓" if passed else "✕"
    label = (
        f"Test complete · {passed_count}/{total} passed"
        if passed
        else f"Test complete · {failed_count} failed"
    )
    st.markdown(
        f"<div style='background:{background};color:{color};border:1px solid {color}33;"
        "border-radius:12px;padding:15px 17px;margin:18px 0 12px;"
        f"font-size:16px;font-weight:750;'>{icon} {label}</div>",
        unsafe_allow_html=True,
    )
    dataset = repository.get_dataset_revision(run.dataset_revision_id)
    results = {result.case_id: result for result in run.case_results}
    st.markdown("#### Test results")
    _render_test_cases(dataset.cases, results)
    if st.button(
        "See result",
        key=f"run_see_result_{report.report_id}",
        type="primary",
    ):
        st.session_state["selected_report_id"] = report.report_id
        request_navigation("Report")
        st.rerun()


def render_runs_module(
    repository: WorkbenchRepository,
    agent_id: str,
    runner: Any | None = None,
    report_service: Any | None = None,
) -> None:
    """Render a simple test confirmation with technical details on demand."""
    agent_revision = repository.get_current_agent_revision(agent_id)
    datasets = _dataset_revisions(repository, agent_id)
    drafts = _draft_options(repository, agent_id)
    st.subheader("Run a test")
    st.caption("1 · Review test cases  →  2 · Run")

    if agent_revision is None:
        st.warning("This AI assistant is not ready yet.")
        _render_run_history(repository, agent_id)
        return

    dataset_options: dict[str, tuple[str, Any]] = {}
    # Prefer a stable saved version when users arrive from Home. A draft is
    # preferred only when Test Sets explicitly sends the user here.
    for dataset in datasets:
        key = f"revision:{dataset.revision_id}"
        dataset_options[key] = ("revision", dataset)
    for draft in drafts:
        key = f"draft:{draft['dataset_id']}"
        dataset_options[key] = ("draft", draft)

    selected_source: str | None = None
    selected_value: Any | None = None
    cases: Sequence[TestCase] = ()
    if dataset_options:
        option_ids = list(dataset_options)
        labels = {
            key: (
                f"{value['name']} · {value['case_count']} questions"
                if source == "draft"
                else f"{value.name} · saved v{value.revision} · {len(value.cases)} questions"
            )
            for key, (source, value) in dataset_options.items()
        }
        preferred_dataset_id = st.session_state.get("selected_dataset_id")
        preferred_key = f"draft:{preferred_dataset_id}"
        default_index = option_ids.index(preferred_key) if preferred_key in option_ids else 0
        selected_option = st.selectbox(
            "Test set",
            option_ids,
            index=default_index,
            key=f"run_dataset_revision_{agent_id}",
            format_func=labels.__getitem__,
        )
        selected_source, selected_value = dataset_options[selected_option]
        cases = (
            tuple(DatasetRegistry(repository).list_draft(selected_value["dataset_id"]))
            if selected_source == "draft"
            else selected_value.cases
        )
        with st.container(border=True):
            summary, count = st.columns([5, 1])
            summary.markdown(f"**{labels[selected_option]}**")
            summary.caption("Ready to test")
            count.metric("Questions", len(cases))
    else:
        st.warning("Add at least one question to a test set first.")

    unavailable = unavailable_case_tools(cases, agent_revision.tools)
    if cases:
        st.markdown("#### Test cases")
        st.caption("These questions will run in the order shown.")
        _render_test_cases(cases)

    selected_dataset: DatasetRevision | None = (
        selected_value if selected_source == "revision" else None
    )
    start_disabled = selected_value is None or runner is None
    if runner is None:
        st.caption("Testing is temporarily unavailable.")
    if st.button(
        "Start test",
        key="run_start",
        type="primary",
        disabled=start_disabled,
        width="stretch",
    ):
        st.session_state.pop(f"run_completed_report_{agent_id}", None)
        try:
            if selected_source == "draft":
                selected_dataset = DatasetRegistry(repository).publish(
                    selected_value["dataset_id"]
                )
        except ValueError as error:
            st.error(str(error))
        else:
            assert selected_dataset is not None
            progress_bar = st.progress(0.0, text="Starting test")
            progress_lines: list[str] = []

            def on_progress(done: int, total: int, label: str) -> None:
                progress_bar.progress(done / max(total, 1), text=f"{done}/{total} questions")
                progress_lines.append(label)

            try:
                with st.spinner("Running test…"):
                    run = _run_result(
                        runner.run_revision(
                            agent_revision.revision_id,
                            selected_dataset.revision_id,
                            progress=on_progress,
                        )
                    )
                    report = report_service.create(run.run_id) if report_service is not None else None
            except Exception as error:  # service boundary: preserve error state in the UI
                st.error(f"Test failed: {error}")
            else:
                st.session_state["selected_run_id"] = run.run_id
                can_rerun = True
                if report is not None:
                    try:
                        persisted_report = repository.get_report(report.report_id)
                        persisted_run = repository.get_run(persisted_report.run_id)
                    except KeyError:
                        st.error("The result could not be saved.")
                        can_rerun = False
                    else:
                        persisted_run_matches_context = (
                            persisted_run.status is RunStatus.COMPLETED
                            and persisted_run.run_id == run.run_id
                            and persisted_run.agent_id == agent_id
                        )
                        if not persisted_run_matches_context:
                            st.error("The result could not be saved.")
                            can_rerun = False
                        else:
                            st.session_state["selected_report_id"] = persisted_report.report_id
                            st.session_state[
                                f"run_completed_report_{agent_id}"
                            ] = persisted_report.report_id
                st.success("Test complete.")
                if progress_lines:
                    st.code("\n".join(progress_lines), language="text")
                if can_rerun:
                    st.rerun()

    with st.expander("Test details"):
        model = str(agent_revision.config_snapshot.get("model", "Default"))
        target_tools = sorted(
            {
                str(
                    case.expected_output.get("target_tool")
                    or case.expected_output.get("expected_tool_called")
                    or case.metadata.get("tool_name")
                )
                for case in cases
                if (
                    case.expected_output.get("target_tool")
                    or case.expected_output.get("expected_tool_called")
                    or case.metadata.get("tool_name")
                )
            }
        )
        roles = sorted(
            {str(case.input.get("user_role") or "user").title() for case in cases}
        )
        allowed = sum(
            str(case.expected_output.get("permission_decision") or "ALLOW").upper()
            == "ALLOW"
            for case in cases
        )
        source_label = (
            "Draft"
            if selected_source == "draft"
            else f"Saved v{selected_value.revision}"
            if selected_value is not None
            else "Not selected"
        )
        details = [
            {"Detail": "Assistant", "Value": f"Version {agent_revision.revision} · {model}"},
            {"Detail": "Test set", "Value": f"{source_label} · {len(cases)} questions"},
            {"Detail": "User roles", "Value": ", ".join(roles) or "None"},
            {"Detail": "Tools covered", "Value": ", ".join(target_tools) or "None"},
            {
                "Detail": "Permission checks",
                "Value": f"{allowed} allow · {len(cases) - allowed} deny",
            },
            {"Detail": "LLM Judge", "Value": "Available on demand in Report"},
        ]
        st.dataframe(details, width="stretch", hide_index=True)
        if unavailable:
            st.warning(f"Unavailable Tools: {', '.join(unavailable)}")

    _render_test_completion(repository, agent_id)

    with st.expander("Previous tests"):
        _render_run_history(repository, agent_id)
