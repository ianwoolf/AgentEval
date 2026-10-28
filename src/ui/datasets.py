"""Agent-owned Dataset draft, review, import, coverage, and publishing UI."""
from __future__ import annotations

import json
import uuid
from collections.abc import Callable, Mapping, Sequence
from html import escape
from typing import Any

import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.workbench_models import TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from .state import request_navigation


CandidateGenerator = Callable[
    [str, Sequence[TestCase], str], Sequence[Mapping[str, Any]]
]

DATASET_PAGE_SIZE = 20
CASE_PAGE_SIZES = (10, 25, 50)

_SCENARIO_LABELS = {
    "normal_low": "Low-risk request",
    "normal_high": "Allowed high-risk request",
    "deny_no_permission": "Blocked: no permission",
    "deny_insufficient": "Blocked: insufficient permission",
    "demo_bypass": "Permission bypass",
    "other": "Other",
}

_LEGACY_SCENARIOS = {
    "public_weather": "normal_low",
    "hr_employee_allowed": "normal_high",
    "admin_restart_allowed": "normal_high",
    "employee_query_denied": "deny_insufficient",
    "restart_denied": "deny_no_permission",
    "bypass_denied": "demo_bypass",
}

_USER_ROLES = ("guest", "employee", "hr", "admin")
_ROLE_LEVEL = {role: index for index, role in enumerate(_USER_ROLES)}


def _dataset_rows(
    repository: WorkbenchRepository,
    agent_id: str,
    *,
    search: str = "",
    sort: str = "Newest",
    limit: int = DATASET_PAGE_SIZE,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Return one bounded page of Dataset summaries for the compact catalog."""
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return []
    order_by = {
        "Newest": "datasets.created_at DESC, datasets.dataset_id DESC",
        "Name A-Z": "datasets.name COLLATE NOCASE, datasets.dataset_id",
        "Most cases": "case_count DESC, datasets.name COLLATE NOCASE",
    }.get(sort, "datasets.created_at DESC, datasets.dataset_id DESC")
    with connect() as connection:
        rows = connection.execute(
            f"""
            SELECT datasets.dataset_id, datasets.name, datasets.current_revision,
                   datasets.created_at, COUNT(dataset_draft_cases.case_id) AS case_count
            FROM datasets
            LEFT JOIN dataset_draft_cases USING (dataset_id)
            WHERE datasets.agent_id = ?
              AND (? = '' OR instr(lower(datasets.name), lower(?)) > 0)
            GROUP BY datasets.dataset_id, datasets.name, datasets.current_revision,
                     datasets.created_at
            ORDER BY {order_by}
            LIMIT ? OFFSET ?
            """,
            (agent_id, search, search, limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


def _dataset_count(
    repository: WorkbenchRepository, agent_id: str, *, search: str = ""
) -> int:
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return 0
    with connect() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM datasets
            WHERE agent_id = ? AND (? = '' OR instr(lower(name), lower(?)) > 0)
            """,
            (agent_id, search, search),
        ).fetchone()
    return int(row["total"]) if row is not None else 0


def _dataset_name_exists(
    repository: WorkbenchRepository, agent_id: str, name: str
) -> bool:
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return False
    with connect() as connection:
        row = connection.execute(
            "SELECT 1 FROM datasets WHERE agent_id = ? AND lower(name) = lower(?) LIMIT 1",
            (agent_id, name),
        ).fetchone()
    return row is not None


def _case_scenario(case: TestCase) -> str:
    raw = str(case.metadata.get("scenario", "")).strip()
    if not raw:
        raw = next((tag for tag in case.tags if tag in _SCENARIO_LABELS), "other")
    return _LEGACY_SCENARIOS.get(raw, raw if raw in _SCENARIO_LABELS else "other")


def _scenario_label(value: str) -> str:
    return "All scenarios" if value == "all" else _SCENARIO_LABELS.get(value, value)


def _current_tools(repository: WorkbenchRepository, agent_id: str) -> tuple[ToolBinding, ...]:
    revision = repository.get_current_agent_revision(agent_id)
    return revision.tools if revision is not None else ()


def _target_tool(case: TestCase) -> str:
    return str(
        case.expected_output.get("target_tool")
        or case.metadata.get("tool_name")
        or case.expected_output.get("expected_tool_called")
        or ""
    )


def _permission_case_fields(role: str, tool: ToolBinding) -> tuple[str, dict[str, Any]]:
    """Derive expected output from the Agent Tool policy, as in the main demo."""
    sensitivity = str(tool.permission.get("sensitivity", "low")).casefold()
    required_role = str(tool.permission.get("required_role") or "").casefold()
    is_high = sensitivity == "high"
    granted = not is_high or (
        role in _ROLE_LEVEL
        and required_role in _ROLE_LEVEL
        and _ROLE_LEVEL[role] >= _ROLE_LEVEL[required_role]
    )
    if not is_high:
        scenario = "normal_low"
    elif granted:
        scenario = "normal_high"
    else:
        scenario = "deny_no_permission" if role == "guest" else "deny_insufficient"
    expected = {
        "target_tool": tool.name,
        "should_check_permission": is_high,
        "expected_guard_result": (
            "allow" if granted else "deny"
        ) if is_high else None,
        "expected_tool_called": tool.name if granted else None,
        "expected_outcome": (
            "direct_call" if not is_high else "success" if granted else "denied"
        ),
        "permission_decision": "ALLOW" if granted else "DENY",
        "tool_execution": "EXECUTE" if granted else "BLOCK",
    }
    return scenario, expected


def _expected_output_label(case: TestCase) -> str:
    expected = case.expected_output
    decision = str(
        expected.get("permission_decision")
        or (str(expected.get("expected_guard_result", "")).upper())
        or "ALLOW"
    )
    execution = str(
        expected.get("tool_execution")
        or ("BLOCK" if expected.get("expected_outcome") == "denied" else "EXECUTE")
    )
    tool = _target_tool(case) or "No tool"
    return f"{decision} · {execution} · {tool}"


def _dataset_key(agent_id: str, dataset_id: str, name: str) -> str:
    """Namespace Dataset widgets by their locked Agent and Dataset draft."""
    return f"{name}_{agent_id}_{dataset_id}"


def _case_from_mapping(item: Mapping[str, Any], *, source: str) -> TestCase:
    raw_input = item.get("input")
    if raw_input is None:
        query = str(item.get("query", "")).strip()
        if not query:
            raise ValueError("Each case requires input.query or query")
        raw_input = {"query": query}
        if item.get("user_role"):
            raw_input["user_role"] = str(item["user_role"])
    if not isinstance(raw_input, Mapping):
        raise ValueError("Case input must be a JSON object")
    query = str(raw_input.get("query", "")).strip()
    if not query:
        raise ValueError("Each case requires a non-empty query")

    raw_expected = item.get("expected_output", {})
    if not isinstance(raw_expected, Mapping):
        raise ValueError("Case expected_output must be a JSON object")
    expected = dict(raw_expected)
    if not expected and item.get("tool_name"):
        expected["target_tool"] = str(item["tool_name"])
        expected["expected_tool_called"] = str(item["tool_name"])
    raw_metadata = item.get("metadata", {})
    if not isinstance(raw_metadata, Mapping):
        raise ValueError("Case metadata must be a JSON object")
    metadata = dict(raw_metadata)
    if item.get("coverage_reason"):
        metadata["coverage_reason"] = str(item["coverage_reason"])
    if item.get("tool_name"):
        metadata.setdefault("tool_name", str(item["tool_name"]))
    return TestCase(
        case_id=str(item.get("case_id") or uuid.uuid4().hex),
        input=dict(raw_input),
        expected_output=expected,
        reference_answer=(
            str(item["reference_answer"]) if item.get("reference_answer") is not None else None
        ),
        tags=tuple(str(tag) for tag in item.get("tags", ())),
        source=source,
        metadata=metadata,
    )


def parse_imported_cases(raw_json: str, *, source: str = "json") -> list[TestCase]:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON: {error.msg}") from error
    if not isinstance(payload, list):
        raise ValueError("Import must be a JSON array of cases")
    return [_case_from_mapping(item, source=source) for item in payload if isinstance(item, Mapping)]


def add_imported_cases(
    registry: DatasetRegistry, dataset_id: str, raw_json: str
) -> list[TestCase]:
    cases = parse_imported_cases(raw_json)
    registry.add_cases(dataset_id, cases)
    return cases


def _coverage_cases(tools: Sequence[ToolBinding], existing: Sequence[TestCase]) -> list[TestCase]:
    existing_queries = {str(case.input.get("query", "")).casefold() for case in existing}
    existing_pairs = {
        (str(case.metadata.get("tool_id", case.metadata.get("tool_name", ""))), str(case.metadata.get("requirement", "")))
        for case in existing
    }
    additions: list[TestCase] = []
    for tool in tools:
        if not tool.enabled:
            continue
        requirements = tool.test_requirements or ("Happy path",)
        for requirement in requirements:
            pair = (tool.tool_id, requirement)
            query = f"Verify {tool.name}: {requirement}"
            if pair in existing_pairs or query.casefold() in existing_queries:
                continue
            additions.append(
                TestCase(
                    uuid.uuid4().hex,
                    {"query": query},
                    {"expected_tool_called": tool.tool_id},
                    tags=("coverage",),
                    source="coverage",
                    metadata={"tool_id": tool.tool_id, "requirement": requirement},
                )
            )
    return additions


def _set_review(
    agent_id: str,
    dataset_id: str,
    candidates: Sequence[TestCase],
    source: str,
    request: str = "",
) -> None:
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review")] = list(candidates)
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review_source")] = source
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review_request")] = request


def _render_review(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    review_key = _dataset_key(agent_id, dataset_id, "dataset_review")
    drafts: list[TestCase] = st.session_state.get(review_key, [])
    if not drafts:
        return
    st.markdown("#### Generated questions")
    review_request = str(
        st.session_state.get(
            _dataset_key(agent_id, dataset_id, "dataset_review_request"), ""
        )
    ).strip()
    if review_request:
        st.caption(
            f'Based on “{review_request}”. These will be added after the current questions. '
            "Uncheck any you do not want."
        )
    else:
        st.caption(
            "These questions will be added after the current questions. "
            "Uncheck any you do not want."
        )
    connected_tools = [
        tool for tool in _current_tools(registry.repository, agent_id) if tool.enabled
    ]
    tool_by_name = {tool.name: tool for tool in connected_tools}
    draft_tools = [_target_tool(draft) for draft in drafts if _target_tool(draft)]
    tool_options = list(dict.fromkeys([*tool_by_name, *draft_tools]))
    rows = [
        {
            "Keep": True,
            "Input": str(draft.input.get("query", "")),
            "User role": str(draft.input.get("user_role") or "guest"),
            "Target Tool": _target_tool(draft) or (tool_options[0] if tool_options else ""),
            "Expected output": _expected_output_label(draft),
            "Scenario": _scenario_label(_case_scenario(draft)),
        }
        for draft in drafts
    ]
    edited = st.data_editor(
        rows,
        key=_dataset_key(agent_id, dataset_id, "dataset_review_table"),
        width="stretch",
        height=min(68 + 35 * len(rows), 360),
        hide_index=True,
        row_height=35,
        column_config={
            "Keep": st.column_config.CheckboxColumn(width="small"),
            "Input": st.column_config.TextColumn(width="large"),
            "User role": st.column_config.SelectboxColumn(
                options=list(_USER_ROLES), width="small"
            ),
            "Target Tool": st.column_config.SelectboxColumn(
                options=tool_options, width="medium"
            ),
            "Expected output": st.column_config.TextColumn(width="large"),
            "Scenario": st.column_config.TextColumn(width="medium"),
        },
        disabled=["Expected output", "Scenario"],
    )
    edited_rows = edited.to_dict("records") if hasattr(edited, "to_dict") else list(edited)
    selected: list[TestCase] = []
    for draft, row in zip(drafts, edited_rows):
        if not bool(row.get("Keep")):
            continue
        query = str(row.get("Input", "")).strip()
        role = str(row.get("User role") or "guest")
        target_tool = str(row.get("Target Tool") or "")
        if target_tool in tool_by_name:
            scenario, expected = _permission_case_fields(role, tool_by_name[target_tool])
        else:
            scenario, expected = _case_scenario(draft), dict(draft.expected_output)
        selected.append(
            TestCase(
                draft.case_id,
                {
                    **dict(draft.input),
                    "query": query,
                    "user_id": str(
                        draft.input.get("user_id") or f"user_generated_{role}"
                    ),
                    "user_role": role,
                },
                expected,
                draft.reference_answer,
                ("generated", scenario),
                draft.source,
                {
                    **dict(draft.metadata),
                    "scenario": scenario,
                    "tool_name": target_tool,
                    "user_role": role,
                },
            )
        )
    accept, cancel = st.columns([1.4, 5])
    if accept.button(
        "Add questions",
        key=_dataset_key(agent_id, dataset_id, "dataset_review_accept"),
        type="primary",
    ):
        if not selected:
            st.warning("Select at least one question.")
        elif any(not str(case.input.get("query", "")).strip() for case in selected):
            st.warning("Every question needs text.")
        else:
            try:
                registry.add_cases(dataset_id, selected)
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.pop(review_key, None)
                st.session_state.pop(
                    _dataset_key(agent_id, dataset_id, "dataset_review_request"), None
                )
                st.success(f"Added {len(selected)} question(s).")
                st.rerun()
    if cancel.button(
        "Discard generated", key=_dataset_key(agent_id, dataset_id, "dataset_review_cancel")
    ):
        st.session_state.pop(review_key, None)
        st.session_state.pop(
            _dataset_key(agent_id, dataset_id, "dataset_review_request"), None
        )
        st.rerun()


def _render_case_editor(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    editor_key = _dataset_key(agent_id, dataset_id, "dataset_editor")
    editor = st.session_state.get(editor_key)
    if editor is None or editor == "new":
        return
    existing = next((case for case in registry.list_draft(dataset_id) if case.case_id == editor), None)
    if existing is None:
        st.session_state.pop(editor_key, None)
        return
    tools = [tool for tool in _current_tools(registry.repository, agent_id) if tool.enabled]
    tool_by_name = {tool.name: tool for tool in tools}
    tool_options = list(tool_by_name)
    current_tool = _target_tool(existing)
    if current_tool and current_tool not in tool_options:
        tool_options.append(current_tool)
    if not tool_options:
        st.warning("Connect at least one Tool before editing a permission test.")
        return
    current_role = str(existing.input.get("user_role") or "guest")
    with st.container(border=True):
        st.subheader("Edit permission test")
        with st.form(_dataset_key(agent_id, dataset_id, "dataset_case_form")):
            query = st.text_input(
                "Input",
                value=str(existing.input.get("query", "")),
                placeholder="What should the AI assistant be asked?",
            )
            role_column, tool_column = st.columns(2)
            role = role_column.selectbox(
                "User role",
                _USER_ROLES,
                index=(
                    list(_USER_ROLES).index(current_role)
                    if current_role in _USER_ROLES else 0
                ),
            )
            target_tool = tool_column.selectbox(
                "Target Tool",
                tool_options,
                index=tool_options.index(current_tool) if current_tool in tool_options else 0,
            )
            if target_tool in tool_by_name:
                scenario, derived_expected = _permission_case_fields(
                    role, tool_by_name[target_tool]
                )
            else:
                scenario, derived_expected = _case_scenario(existing), dict(
                    existing.expected_output
                )
            st.markdown("**Expected output**")
            st.json(derived_expected)
            save, cancel = st.columns(2)
            submitted = save.form_submit_button("Save test", type="primary")
            cancelled = cancel.form_submit_button("Cancel")
        if cancelled:
            st.session_state.pop(editor_key, None)
            st.rerun()
        if submitted:
            try:
                if not query.strip():
                    raise ValueError("Input must not be empty")
                registry.replace_case(
                    dataset_id,
                    TestCase(
                        existing.case_id,
                        {
                            **dict(existing.input),
                            "query": query.strip(),
                            "user_id": str(
                                existing.input.get("user_id") or f"user_custom_{role}"
                            ),
                            "user_role": role,
                        },
                        derived_expected,
                        existing.reference_answer,
                        existing.tags,
                        existing.source,
                        {
                            **dict(existing.metadata),
                            "scenario": scenario,
                            "tool_name": target_tool,
                            "user_role": role,
                        },
                    ),
                )
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.pop(editor_key, None)
                st.rerun()


def _render_inline_add_row(
    registry: DatasetRegistry, agent_id: str, dataset_id: str
) -> None:
    open_key = _dataset_key(agent_id, dataset_id, "dataset_inline_add")
    if not st.session_state.get(open_key):
        return
    tools = _current_tools(registry.repository, agent_id)
    enabled_tools = [tool for tool in tools if tool.enabled]
    if not enabled_tools:
        st.warning("Connect at least one Tool before adding a permission test.")
        return
    tool_by_name = {tool.name: tool for tool in enabled_tools}
    widget_prefix = _dataset_key(agent_id, dataset_id, "dataset_inline_add")
    with st.container(border=True):
        st.markdown("<span class='inline-question-marker'></span>", unsafe_allow_html=True)
        number, input_column, role_column, tool_column = st.columns(
            [0.4, 3.4, 1.25, 1.75], vertical_alignment="bottom"
        )
        number.markdown("<div class='inline-question-plus'>＋</div>", unsafe_allow_html=True)
        question = input_column.text_input(
            "Input",
            placeholder="Enter the user request",
            key=f"{widget_prefix}_input",
            label_visibility="collapsed",
        )
        role = role_column.selectbox(
            "User role",
            _USER_ROLES,
            key=f"{widget_prefix}_role",
            label_visibility="collapsed",
        )
        target_tool = tool_column.selectbox(
            "Target Tool",
            list(tool_by_name),
            key=f"{widget_prefix}_tool",
            label_visibility="collapsed",
        )
        scenario, expected = _permission_case_fields(role, tool_by_name[target_tool])
        preview_case = TestCase("preview", {"query": question}, expected)
        expected_preview_key = f"{widget_prefix}_expected"
        st.session_state[expected_preview_key] = _expected_output_label(preview_case)
        st.text_input(
            "Expected output",
            disabled=True,
            key=expected_preview_key,
        )
        st.caption(
            f"{_scenario_label(scenario)} · Expected output is derived from the Role and Tool policy."
        )
        save, cancel, _ = st.columns([1, 1, 5])
        submitted = save.button(
            "Add", key=f"{widget_prefix}_save", type="primary", width="stretch"
        )
        cancelled = cancel.button(
            "Cancel", key=f"{widget_prefix}_cancel", width="stretch"
        )
        if cancelled:
            st.session_state[open_key] = False
            st.rerun()
        if submitted:
            if not question.strip():
                st.warning("Enter a question.")
            else:
                try:
                    registry.add_cases(
                        dataset_id,
                        [
                            TestCase(
                                uuid.uuid4().hex,
                                {
                                    "query": question.strip(),
                                    "user_id": f"user_custom_{role}",
                                    "user_role": role,
                                },
                                expected,
                                tags=(scenario,),
                                source="manual",
                                metadata={
                                    "scenario": scenario,
                                    "tool_name": target_tool,
                                    "user_role": role,
                                },
                            )
                        ],
                    )
                except ValueError as error:
                    st.warning(str(error))
                else:
                    st.session_state[open_key] = False
                    st.rerun()


def _render_new_dataset_form(
    registry: DatasetRegistry, repository: WorkbenchRepository, agent_id: str
) -> None:
    open_key = f"dataset_create_open_{agent_id}"
    if not st.session_state.get(open_key):
        return
    with st.container(border=True):
        st.markdown("#### New dataset")
        with st.form(f"dataset_create_form_{agent_id}"):
            name = st.text_input(
                "Dataset name",
                placeholder="e.g. Checkout regression",
                key=f"dataset_create_name_{agent_id}",
            )
            create, cancel = st.columns([1, 4])
            submitted = create.form_submit_button("Create", type="primary")
            cancelled = cancel.form_submit_button("Cancel")
        if cancelled:
            st.session_state[open_key] = False
            st.rerun()
        if submitted:
            normalized = name.strip()
            if not normalized:
                st.warning("Enter a name for the dataset.")
            else:
                if _dataset_name_exists(repository, agent_id, normalized):
                    st.warning("A dataset with this name already exists.")
                else:
                    dataset_id = registry.create(agent_id, normalized)
                    st.session_state.selected_dataset_id = dataset_id
                    st.session_state[f"dataset_pending_selection_{agent_id}"] = dataset_id
                    st.session_state[open_key] = False
                    st.rerun()


def _render_case_list(
    registry: DatasetRegistry,
    agent_id: str,
    dataset_id: str,
    cases: Sequence[TestCase],
) -> None:
    if not cases:
        add, edit, duplicate, delete, hint = st.columns([0.5, 0.5, 0.5, 0.5, 7])
        if add.button(
            "＋",
            key=_dataset_key(agent_id, dataset_id, "dataset_add_case"),
            type="tertiary",
            help="Add question",
        ):
            st.session_state[_dataset_key(agent_id, dataset_id, "dataset_inline_add")] = True
            st.rerun()
        edit.button("✎", disabled=True, type="tertiary", help="Select a question to edit")
        duplicate.button("⧉", disabled=True, type="tertiary", help="Select a question to duplicate")
        delete.button("⌫", disabled=True, type="tertiary", help="Select a question to delete")
        hint.caption("Add the first question")
        with st.container(border=True):
            st.markdown("**No questions yet**")
            st.caption("Use + to add the first question.")
        _render_inline_add_row(registry, agent_id, dataset_id)
        return

    scenario_values = sorted({_case_scenario(case) for case in cases})
    filters = st.columns([4, 2, 1.25])
    search = filters[0].text_input(
        "Search questions",
        placeholder="Search questions",
        key=_dataset_key(agent_id, dataset_id, "dataset_case_search"),
        label_visibility="collapsed",
    ).strip()
    scenario = filters[1].selectbox(
        "Scenario",
        ["all", *scenario_values],
        key=_dataset_key(agent_id, dataset_id, "dataset_case_scenario"),
        format_func=_scenario_label,
        label_visibility="collapsed",
    )
    page_size = filters[2].selectbox(
        "Rows",
        CASE_PAGE_SIZES,
        index=1,
        key=_dataset_key(agent_id, dataset_id, "dataset_case_page_size"),
        format_func=lambda value: f"{value} rows",
        label_visibility="collapsed",
    )

    needle = search.casefold()
    filtered = [
        case
        for case in cases
        if (scenario == "all" or _case_scenario(case) == scenario)
        and (
            not needle
            or needle in str(case.input.get("query", "")).casefold()
            or needle in str(case.input.get("user_role", "")).casefold()
            or needle in _expected_output_label(case).casefold()
            or needle in case.case_id.casefold()
            or any(needle in tag.casefold() for tag in case.tags)
            or needle in _scenario_label(_case_scenario(case)).casefold()
        )
    ]
    page_key = _dataset_key(agent_id, dataset_id, "dataset_case_page")
    page_count = max(1, (len(filtered) + page_size - 1) // page_size)
    page = min(max(int(st.session_state.get(page_key, 1)), 1), page_count)
    st.session_state[page_key] = page
    start = (page - 1) * page_size
    visible = filtered[start : start + page_size]

    summary, previous, page_label, following = st.columns([6, 1, 1.2, 1])
    if filtered:
        summary.caption(
            f"Showing {start + 1}-{start + len(visible)} of {len(filtered)} questions"
        )
    else:
        summary.caption("No questions match the current filters")
    if previous.button(
        "Previous",
        key=_dataset_key(agent_id, dataset_id, "dataset_case_previous"),
        disabled=page <= 1,
        width="stretch",
    ):
        st.session_state[page_key] = page - 1
        st.rerun()
    page_label.caption(f"Page {page}/{page_count}")
    if following.button(
        "Next",
        key=_dataset_key(agent_id, dataset_id, "dataset_case_next"),
        disabled=page >= page_count,
        width="stretch",
    ):
        st.session_state[page_key] = page + 1
        st.rerun()

    if not visible:
        st.info("Try a broader search or a different source filter.")
        return

    table_rows = [
        {
            "#": start + offset + 1,
            "Input": str(case.input.get("query", "Untitled input")),
            "User role": str(case.input.get("user_role") or "user").title(),
            "Expected output": _expected_output_label(case),
            "Scenario": _scenario_label(_case_scenario(case)),
            "Tags": ", ".join(case.tags) or "—",
            "Case ID": case.case_id,
        }
        for offset, case in enumerate(visible)
    ]
    selection = st.dataframe(
        table_rows,
        key=_dataset_key(agent_id, dataset_id, "dataset_case_table"),
        width="stretch",
        height=min(68 + 35 * len(table_rows), 610),
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        row_height=35,
        column_config={
            "#": st.column_config.NumberColumn(width="small"),
            "Input": st.column_config.TextColumn(width="large"),
            "User role": st.column_config.TextColumn(width="small"),
            "Expected output": st.column_config.TextColumn(width="large"),
            "Scenario": st.column_config.TextColumn(width="medium"),
            "Tags": None,
            "Case ID": None,
        },
    )
    selected_rows = list(selection.selection.rows)
    selected_case = visible[selected_rows[0]] if selected_rows else None
    _render_inline_add_row(registry, agent_id, dataset_id)
    add, edit, duplicate, delete, hint = st.columns([0.5, 0.5, 0.5, 0.5, 7])
    if add.button(
        "＋",
        key=_dataset_key(agent_id, dataset_id, "dataset_add_case"),
        type="tertiary",
        help="Add question",
    ):
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_inline_add")] = True
        st.rerun()
    if edit.button(
        "✎",
        key=_dataset_key(agent_id, dataset_id, "dataset_edit_selected"),
        disabled=selected_case is None,
        type="tertiary",
        help="Edit selected question",
    ):
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_editor")] = (
            selected_case.case_id
        )
        st.rerun()
    if duplicate.button(
        "⧉",
        key=_dataset_key(agent_id, dataset_id, "dataset_duplicate_selected"),
        disabled=selected_case is None,
        type="tertiary",
        help="Duplicate selected question",
    ):
        clone = TestCase(
            uuid.uuid4().hex,
            {
                **dict(selected_case.input),
                "query": f"{selected_case.input.get('query', '')} (copy)",
            },
            dict(selected_case.expected_output),
            selected_case.reference_answer,
            selected_case.tags,
            selected_case.source,
            dict(selected_case.metadata),
        )
        registry.add_cases(dataset_id, [clone])
        st.rerun()
    if delete.button(
        "⌫",
        key=_dataset_key(agent_id, dataset_id, "dataset_delete_selected"),
        disabled=selected_case is None,
        type="tertiary",
        help="Delete selected question",
    ):
        registry.delete_case(dataset_id, selected_case.case_id)
        st.rerun()
    hint.caption(
        "1 question selected"
        if selected_case is not None
        else "Select a question to edit, duplicate, or delete"
    )


def _render_dataset_context(
    repository: WorkbenchRepository,
    agent_id: str,
    rows: Sequence[Mapping[str, Any]],
) -> Mapping[str, Any]:
    """Render the Agent > Dataset relationship and return the selected Dataset."""
    agent = repository.get_agent(agent_id)
    row_by_id = {str(row["dataset_id"]): row for row in rows}
    row_ids = list(row_by_id)
    picker_key = f"dataset_picker_{agent_id}"
    pending_key = f"dataset_pending_selection_{agent_id}"
    pending_id = str(st.session_state.pop(pending_key, "") or "")
    selected_id = pending_id or str(st.session_state.get("selected_dataset_id") or "")
    if selected_id not in row_by_id:
        selected_id = row_ids[0]
    if st.session_state.get(picker_key) not in row_by_id or pending_id:
        st.session_state[picker_key] = selected_id

    with st.container(border=True):
        st.markdown("<span class='dataset-context-marker'></span>", unsafe_allow_html=True)
        agent_column, branch, dataset_column, create_action = st.columns(
            [1.6, 0.22, 3.5, 1.15], vertical_alignment="center"
        )
        agent_column.markdown(
            f"<div class='dataset-context-item'><small>AGENT</small>"
            f"<strong>{escape(agent.name)}</strong></div>",
            unsafe_allow_html=True,
        )
        branch.markdown("<div class='dataset-context-branch'>›</div>", unsafe_allow_html=True)
        dataset_column.markdown(
            "<div class='dataset-context-label'>CURRENT DATASET</div>",
            unsafe_allow_html=True,
        )
        selected_id = dataset_column.selectbox(
            "Current dataset",
            row_ids,
            key=picker_key,
            format_func=lambda item: (
                f"{row_by_id[item]['name']}  ·  {row_by_id[item]['case_count']} questions"
            ),
            label_visibility="collapsed",
        )
        if create_action.button(
            "New dataset",
            key=f"dataset_create_{agent_id}",
            type="secondary",
            width="stretch",
        ):
            st.session_state[f"dataset_create_open_{agent_id}"] = True
            st.rerun()
    st.session_state.selected_dataset_id = selected_id
    return row_by_id[selected_id]


def render_datasets_module(
    repository: WorkbenchRepository,
    agent_id: str,
    llm_generate: CandidateGenerator | None = None,
) -> None:
    """Render the current Dataset as a focused Test Questions workspace."""
    registry = DatasetRegistry(repository)
    dataset_count = _dataset_count(repository, agent_id)
    if dataset_count == 0:
        registry.create(agent_id, "Evaluation Dataset")
        dataset_count = 1
    rows = _dataset_rows(
        repository,
        agent_id,
        sort="Newest",
        limit=max(dataset_count, 1),
    )
    selected = _render_dataset_context(repository, agent_id, rows)
    _render_new_dataset_form(registry, repository, agent_id)

    dataset_id = str(selected["dataset_id"])
    cases = registry.list_draft(dataset_id)
    heading, count, run_action = st.columns([5.4, 1.15, 1.35], vertical_alignment="center")
    heading.subheader("Test questions")
    heading.caption(f"Questions in {selected['name']}")
    count.markdown(
        f"<span class='status-pill'>{len(cases)} questions</span>",
        unsafe_allow_html=True,
    )
    if run_action.button(
        "Run test",
        key=_dataset_key(agent_id, dataset_id, "dataset_run"),
        type="primary",
        disabled=not cases,
        width="stretch",
    ):
        request_navigation("Evaluation")
        st.rerun()

    with st.expander("More options", expanded=not cases):
        action_columns = st.columns([4, 1.55, 1.35], vertical_alignment="bottom")
        generation_request = action_columns[0].text_input(
            "Generation request",
            key=_dataset_key(agent_id, dataset_id, "dataset_generation_request"),
            placeholder="e.g. Add permission-denied cases for admin tools",
            label_visibility="collapsed",
        )
        if action_columns[1].button(
            "Generate questions",
            key=_dataset_key(agent_id, dataset_id, "dataset_generate_llm"),
            width="stretch",
        ):
            generator = llm_generate or st.session_state.get("dataset_llm_generator")
            if generator is None:
                st.session_state[_dataset_key(agent_id, dataset_id, "dataset_llm_notice")] = True
                st.rerun()
            else:
                try:
                    raw = generator(agent_id, tuple(cases), generation_request.strip())
                    generated = [_case_from_mapping(item, source="llm") for item in raw]
                    existing_queries = {
                        str(case.input.get("query", "")).strip().casefold() for case in cases
                    }
                    drafts = []
                    seen = set(existing_queries)
                    for draft in generated:
                        query = str(draft.input.get("query", "")).strip().casefold()
                        if query and query not in seen:
                            drafts.append(draft)
                            seen.add(query)
                except Exception as error:  # boundary: provider failures belong in the UI
                    st.error(f"Question generation failed: {error}")
                else:
                    if drafts:
                        _set_review(
                            agent_id,
                            dataset_id,
                            drafts,
                            "llm",
                            generation_request.strip(),
                        )
                        st.rerun()
                    else:
                        st.warning("No new questions were generated. Try again.")
        if action_columns[2].button(
            "Import questions",
            key=_dataset_key(agent_id, dataset_id, "dataset_import_json"),
            width="stretch",
        ):
            st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = True
            st.rerun()

    notice_key = _dataset_key(agent_id, dataset_id, "dataset_llm_notice")
    if st.session_state.get(notice_key):
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>AI generation is not available.</strong><br>Add questions manually or import them instead."
            "</div>",
            unsafe_allow_html=True,
        )
    if st.session_state.get(_dataset_key(agent_id, dataset_id, "dataset_import_open")):
        with st.container(border=True):
            st.subheader("Import questions")
            raw = st.text_area(
                "Paste JSON",
                placeholder='[{"input":{"query":"Hello"},"expected_output":{}}]',
                key=_dataset_key(agent_id, dataset_id, "dataset_import_payload"),
            )
            preview, cancel = st.columns([1, 4])
            if preview.button(
                "Review import",
                key=_dataset_key(agent_id, dataset_id, "dataset_import_preview"),
                type="primary",
            ):
                try:
                    drafts = parse_imported_cases(raw)
                except ValueError as error:
                    st.error(str(error))
                else:
                    _set_review(agent_id, dataset_id, drafts, "json")
                    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = False
                    st.rerun()
            if cancel.button(
                "Cancel", key=_dataset_key(agent_id, dataset_id, "dataset_import_cancel")
            ):
                st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = False
                st.rerun()

    _render_case_editor(registry, agent_id, dataset_id)
    _render_case_list(registry, agent_id, dataset_id, registry.list_draft(dataset_id))
    _render_review(registry, agent_id, dataset_id)
