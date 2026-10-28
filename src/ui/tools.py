"""Agent-owned Tool presentation and revision-backed editing."""
from __future__ import annotations

import json
from typing import Any

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_models import AgentProfile, AgentRevision, ToolBinding
from src.workbench_repository import WorkbenchRepository

_KNOWN_ADAPTERS = {"python", "http", "mock", "langfuse"}


def current_agent_revision(
    repository: WorkbenchRepository, agent: AgentProfile
) -> AgentRevision | None:
    """Return an Agent's current immutable revision without caching records in UI state."""
    if agent.current_revision == 0:
        return None
    # The first repository implementation is SQLite.  The revision identifier is
    # intentionally not duplicated on AgentProfile, so resolve it from its durable
    # record here instead of putting a copy in Streamlit session state.
    with repository._connect() as connection:  # type: ignore[attr-defined]
        row = connection.execute(
            "SELECT revision_id FROM agent_revisions WHERE agent_id = ? AND revision = ?",
            (agent.agent_id, agent.current_revision),
        ).fetchone()
    return repository.get_agent_revision(row["revision_id"]) if row else None


def _json_text(value: dict[str, Any]) -> str:
    return json.dumps(dict(value), indent=2, sort_keys=True)


def _parse_json(label: str, value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value or "{}")
    except json.JSONDecodeError as error:
        raise ValueError(f"{label} must be valid JSON") from error
    if not isinstance(parsed, dict):
        raise ValueError(f"{label} must be a JSON object")
    return parsed


def _tool_from_editor(values: dict[str, Any]) -> ToolBinding:
    tool_id = values["tool_id"].strip()
    name = values["name"].strip()
    if not tool_id or not name:
        raise ValueError("Tool ID and Tool name are required")
    return ToolBinding(
        tool_id=tool_id,
        name=name,
        description=values["description"].strip(),
        connection_type=values["connection_type"].strip().lower(),
        adapter_config=_parse_json("Adapter configuration", values["adapter_config"]),
        input_schema=_parse_json("Input schema", values["input_schema"]),
        output_schema=_parse_json("Output schema", values["output_schema"]),
        permission=_parse_json("Permission", values["permission"]),
        test_requirements=tuple(
            requirement.strip()
            for requirement in values["test_requirements"].splitlines()
            if requirement.strip()
        ),
        verification_required=values["verification_required"],
        enabled=values["enabled"],
    )


def _editor_defaults(tool: ToolBinding | None) -> dict[str, Any]:
    if tool is None:
        return {
            "original_id": None,
            "tool_id": "",
            "name": "",
            "description": "",
            "connection_type": "python",
            "adapter_config": "{}",
            "input_schema": "{}",
            "output_schema": "{}",
            "permission": "{}",
            "test_requirements": "",
            "verification_required": False,
            "enabled": True,
        }
    return {
        "original_id": tool.tool_id,
        "tool_id": tool.tool_id,
        "name": tool.name,
        "description": tool.description,
        "connection_type": tool.connection_type,
        "adapter_config": _json_text(tool.adapter_config),
        "input_schema": _json_text(tool.input_schema),
        "output_schema": _json_text(tool.output_schema),
        "permission": _json_text(tool.permission),
        "test_requirements": "\n".join(tool.test_requirements),
        "verification_required": tool.verification_required,
        "enabled": tool.enabled,
    }


def _save_tool(
    registry: AgentRegistry,
    agent: AgentProfile,
    revision: AgentRevision | None,
    values: dict[str, Any],
) -> None:
    tool = _tool_from_editor(values)
    existing = list(revision.tools) if revision else []
    original_id = values["original_id"]
    updated = [item for item in existing if item.tool_id != original_id]
    if any(item.tool_id == tool.tool_id for item in updated):
        raise ValueError("Tool ID must be unique within this Agent")
    registry.revise(
        agent.agent_id,
        dict(revision.config_snapshot) if revision else {},
        tuple([*updated, tool]),
    )


def _render_editor(
    registry: AgentRegistry,
    agent: AgentProfile,
    revision: AgentRevision | None,
) -> None:
    values = st.session_state.tool_editor
    if values is None:
        return
    title = "Edit tool" if values["original_id"] else "Add tool"
    with st.container(border=True):
        st.subheader(title)
        with st.form("tool_editor_form"):
            left, right = st.columns(2)
            tool_id = left.text_input("Tool ID", value=values["tool_id"])
            name = right.text_input("Tool name", value=values["name"])
            description = st.text_input("Description", value=values["description"])
            connection_type = st.text_input(
                "Connection type", value=values["connection_type"],
                help="Supported adapters: python, http, mock, and langfuse.",
            )
            adapter_config = st.text_area(
                "Adapter configuration (JSON)", value=values["adapter_config"], height=100
            )
            input_schema = st.text_area("Input schema (JSON)", value=values["input_schema"], height=100)
            output_schema = st.text_area("Output schema (JSON)", value=values["output_schema"], height=100)
            permission = st.text_area("Permission (JSON)", value=values["permission"], height=100)
            test_requirements = st.text_area(
                "Test requirements (one per line)", value=values["test_requirements"], height=90
            )
            verification_required = st.checkbox(
                "Effect verification required", value=values["verification_required"]
            )
            enabled = st.checkbox("Tool enabled", value=values["enabled"])
            save, cancel = st.columns(2)
            submitted = save.form_submit_button("Save tool", type="primary", width="stretch")
            cancelled = cancel.form_submit_button("Cancel", width="stretch")
        if cancelled:
            st.session_state.tool_editor = None
            st.rerun()
        if submitted:
            try:
                _save_tool(
                    registry,
                    agent,
                    revision,
                    {
                        "original_id": values["original_id"], "tool_id": tool_id, "name": name,
                        "description": description, "connection_type": connection_type,
                        "adapter_config": adapter_config, "input_schema": input_schema,
                        "output_schema": output_schema, "permission": permission,
                        "test_requirements": test_requirements,
                        "verification_required": verification_required, "enabled": enabled,
                    },
                )
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.tool_editor = None
                st.rerun()


def render_tools_module(
    registry: AgentRegistry, repository: WorkbenchRepository, agent: AgentProfile
) -> None:
    """Render only the Tools captured by the selected Agent's current revision."""
    revision = current_agent_revision(repository, agent)
    heading, add_column = st.columns([5, 1])
    with heading:
        st.subheader("Tools")
        st.caption("Tools are versioned with this Agent. Editing creates a new revision.")
    with add_column:
        if st.button("Add tool", key="tool_add", type="primary", width="stretch"):
            st.session_state.tool_editor = _editor_defaults(None)
            st.rerun()

    _render_editor(registry, agent, revision)
    if st.session_state.tool_editor is not None:
        return
    tools = revision.tools if revision else ()
    if not tools:
        with st.container(border=True):
            st.markdown("#### No tools yet")
            st.caption("Add the first Tool binding to make this Agent evaluation-ready.")
        return

    st.markdown("<div class='tool-table-heading'>Tool <span>Connection</span><span>Test requirements</span><span>Status</span><span>Actions</span></div>", unsafe_allow_html=True)
    for tool in tools:
        connection = tool.connection_type.upper()
        unavailable = tool.connection_type not in _KNOWN_ADAPTERS
        status = "UNAVAILABLE" if unavailable else ("AVAILABLE" if tool.enabled else "DISABLED")
        with st.container(border=True):
            columns = st.columns([2.1, 1.3, 2.0, 1.15, 1.2])
            with columns[0]:
                st.markdown(f"**{tool.name}**")
                st.caption(tool.description or tool.tool_id)
            columns[1].markdown(connection)
            columns[2].markdown(
                ", ".join(tool.test_requirements) if tool.test_requirements else "No requirements"
            )
            columns[3].markdown(f"<span class='status-pill'>{status}</span>", unsafe_allow_html=True)
            with columns[4]:
                edit, remove = st.columns(2)
                if edit.button("Edit", key=f"edit_tool_{tool.tool_id}", help="Edit Tool binding"):
                    st.session_state.tool_editor = _editor_defaults(tool)
                    st.rerun()
                if remove.button("Remove", key=f"remove_tool_{tool.tool_id}", help="Create a revision without this Tool"):
                    registry.revise(
                        agent.agent_id,
                        dict(revision.config_snapshot),
                        tuple(item for item in revision.tools if item.tool_id != tool.tool_id),
                    )
                    st.rerun()
