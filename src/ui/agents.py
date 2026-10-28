"""Selected-Agent home overview for the modular workbench."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_models import AgentProfile, ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .state import request_navigation, select_agent


_DEMO_MARKETPLACE: tuple[dict[str, Any], ...] = (
    {
        "id": "system_restart",
        "name": "System restart",
        "description": "Restarts a managed server after user confirmation.",
        "source": "Internal marketplace",
        "approval": True,
        "default": True,
    },
    {
        "id": "employee_lookup",
        "name": "Employee lookup",
        "description": "Finds employee records the user is allowed to view.",
        "source": "Internal marketplace",
        "approval": False,
        "default": True,
    },
    {
        "id": "weather",
        "name": "Weather",
        "description": "Gets current weather information for a location.",
        "source": "Internal marketplace",
        "approval": False,
        "default": True,
    },
    {
        "id": "slack_notification",
        "name": "Slack notification",
        "description": "Sends a message to an approved Slack channel.",
        "source": "Internal marketplace",
        "approval": True,
        "default": False,
    },
    {
        "id": "ticket_creation",
        "name": "Ticket creation",
        "description": "Creates a support ticket with the required context.",
        "source": "Internal marketplace",
        "approval": False,
        "default": False,
    },
)


def _demo_app_code(agent: AgentProfile) -> str:
    """Return the hard-coded per-Agent property used by this visual demo."""
    if agent.name == "Demo Agent":
        return "ADA"
    return f"APP-{agent.agent_id[:4].upper()}"


def _init_demo_tool_state(agent_id: str) -> dict[str, Any]:
    if "demo_agent_states" not in st.session_state:
        st.session_state.demo_agent_states = {}
    if agent_id not in st.session_state.demo_agent_states:
        st.session_state.demo_agent_states[agent_id] = {
            "market_selection": {
                tool["id"]: bool(tool["default"]) for tool in _DEMO_MARKETPLACE
            },
            "custom_tools": [],
            "tool_overrides": {},
        }
    return st.session_state.demo_agent_states[agent_id]


def _connected_demo_tools(agent_id: str) -> list[dict[str, Any]]:
    state = _init_demo_tool_state(agent_id)
    overrides = state["tool_overrides"]
    marketplace = [
        {**tool, **overrides.get(tool["id"], {}), "status": "Ready"}
        for tool in _DEMO_MARKETPLACE
        if state["market_selection"].get(tool["id"], False)
    ]
    custom = [
        {**tool, **overrides.get(tool["id"], {})}
        for tool in state["custom_tools"]
    ]
    return [*marketplace, *custom]


def valid_agents(repository: WorkbenchRepository) -> list[AgentProfile]:
    """Return only persisted Agents with an immutable revision to evaluate."""
    return [agent for agent in repository.list_agents() if agent.current_revision > 0]


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _evaluation_cost(costs: Mapping[str, Any]) -> float | None:
    value = costs.get("evaluation_total")
    return float(value) if value is not None else None


def report_history_rows(reports: Sequence[ReportSnapshot]) -> list[dict[str, Any]]:
    """Normalize immutable Report snapshots into newest-first Agent history rows."""
    ordered = sorted(
        reports,
        key=lambda report: (report.created_at, report.report_id),
        reverse=True,
    )
    rows: list[dict[str, Any]] = []
    for report in ordered:
        summary = _mapping(report.summary)
        identity = _mapping(summary.get("identity"))
        agent = _mapping(identity.get("agent"))
        dataset = _mapping(identity.get("dataset"))
        metrics = _mapping(summary.get("metrics"))
        costs = _mapping(summary.get("costs"))
        current_rate = float(metrics.get("pass_rate", 0.0))
        rows.append(
            {
                "Report ID": report.report_id,
                "Time": report.created_at,
                "Agent revision": agent.get("revision"),
                "Dataset revision": dataset.get("revision"),
                "Status": summary.get("status", report.status),
                "Pass rate": current_rate,
                "Pass rate delta": None,
                "Cost": _evaluation_cost(costs),
            }
        )
    for index, row in enumerate(rows[:-1]):
        row["Pass rate delta"] = row["Pass rate"] - rows[index + 1]["Pass rate"]
    return rows


def _tool_rows(agent_id: str, repository: WorkbenchRepository) -> list[dict[str, Any]]:
    revision = repository.get_current_agent_revision(agent_id)
    if revision is None:
        return []
    return [
        {
            "Name": tool.name,
            "Tool ID": tool.tool_id,
            "Connection": tool.connection_type.upper(),
            "Enabled": "Yes" if tool.enabled else "No",
            "Effect verification": "Required" if tool.verification_required else "Not required",
        }
        for tool in revision.tools
    ]


def _open_report(report: ReportSnapshot | None) -> None:
    if report is not None:
        st.session_state.selected_report_id = report.report_id
    request_navigation("Report")


def _render_demo_result(report: ReportSnapshot | None) -> None:
    """Render the fixed, compact latest-result card requested for visual review."""
    with st.container(border=True):
        st.markdown("<span class='home-result-marker'></span>", unsafe_allow_html=True)
        heading, time = st.columns([4, 2], vertical_alignment="center")
        heading.markdown("<div class='home-result-heading'>Latest result</div>", unsafe_allow_html=True)
        time.markdown(
            "<div class='home-result-time'>Last checked Jul 30, 3:01 PM</div>",
            unsafe_allow_html=True,
        )
        st.markdown(
            """
            <div class="home-review-state"><span>!</span> Needs review</div>
            <div class="home-latest-score" role="group" aria-label="Latest check result">
              <div class="home-score-value"><strong>5/6</strong><span>checks passed</span></div>
              <div class="home-score-delta"><strong>+10%</strong><span>vs last check</span></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        primary, spacer = st.columns([1.05, 5])
        report_key = f"view_report_{report.report_id}" if report is not None else "demo_view_result"
        if primary.button(
            "Review",
            key=report_key,
            type="primary",
            width="stretch",
        ):
            _open_report(report)
            st.rerun()


@st.dialog("Tool configuration", width="large")
def _tool_details_dialog(tool: dict[str, Any], agent_id: str) -> None:
    """Show a small editable configuration proving that the Tool is usable."""
    state = _init_demo_tool_state(agent_id)
    tool_id = str(tool["id"])
    state_key = f"{agent_id}_{tool_id}"
    st.markdown("<span class='tool-details-marker'></span>", unsafe_allow_html=True)
    st.subheader(str(tool["name"]))
    st.caption(str(tool["description"]))
    st.markdown(
        f"""
        <div class="tool-config-summary">
          <div><small>STATUS</small><strong class="tool-ready-dot">● Ready</strong></div>
          <div><small>SOURCE</small><strong>{tool.get('source', 'Custom setup')}</strong></div>
          <div><small>LAST VERIFIED</small><strong>12 minutes ago</strong></div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    name = st.text_input("Tool name", value=str(tool["name"]), key=f"tool_name_{state_key}")
    description = st.text_area(
        "Description",
        value=str(tool["description"]),
        key=f"tool_description_{state_key}",
    )
    enabled = st.toggle("Enabled for this assistant", value=True, key=f"tool_enabled_{state_key}")
    approval = st.toggle(
        "Require confirmation before use",
        value=bool(tool.get("approval", False)),
        key=f"tool_approval_{state_key}",
    )
    with st.expander("Connection details"):
        st.text_input(
            "Tool URL",
            value=str(tool.get("endpoint", "Managed by the internal marketplace")),
            disabled=tool.get("source") == "Internal marketplace",
            key=f"tool_endpoint_{state_key}",
        )
        st.caption("Authentication is configured with a secret reference. No secret is displayed here.")

    test, save = st.columns(2)
    if test.button("Test configuration", width="stretch", key=f"tool_test_{state_key}"):
        st.success("Configuration verified. The Tool responded successfully.")
    if save.button(
        "Save configuration",
        type="primary",
        width="stretch",
        key=f"tool_save_{state_key}",
    ):
        state["tool_overrides"][tool_id] = {
            "name": name.strip() or str(tool["name"]),
            "description": description.strip() or str(tool["description"]),
            "approval": approval,
            "enabled": enabled,
        }
        st.toast("Tool configuration saved.")
        st.rerun()


@st.dialog("Manage tools", width="large")
def _manage_tools_dialog(agent_id: str) -> None:
    """Render the preconfigured marketplace and a minimal manual setup path."""
    state = _init_demo_tool_state(agent_id)
    key_suffix = agent_id
    st.markdown("<span class='manage-tools-marker'></span>", unsafe_allow_html=True)
    marketplace, manual = st.tabs(("Marketplace", "Manual setup"))
    with marketplace:
        st.caption("Marketplace Tools are preconfigured and verified by the internal platform.")
        for tool in _DEMO_MARKETPLACE:
            st.checkbox(
                f"{tool['name']}  ·  Ready",
                value=bool(state["market_selection"].get(tool["id"], False)),
                key=f"market_select_{tool['id']}_{key_suffix}",
                help=str(tool["description"]),
            )
            st.caption(str(tool["description"]))
        if st.button(
            "Save changes",
            type="primary",
            key=f"save_market_tools_{key_suffix}",
        ):
            state["market_selection"] = {
                tool["id"]: bool(
                    st.session_state.get(f"market_select_{tool['id']}_{key_suffix}", False)
                )
                for tool in _DEMO_MARKETPLACE
            }
            st.toast("Tool selection saved.")
            st.rerun()

    with manual:
        st.caption("Add only the information needed to verify that the Tool can connect.")
        name = st.text_input(
            "Tool name", placeholder="Order lookup", key=f"manual_tool_name_{key_suffix}"
        )
        description = st.text_area(
            "Description",
            placeholder="Find the current status of an order.",
            key=f"manual_tool_description_{key_suffix}",
        )
        endpoint = st.text_input(
            "Tool URL",
            placeholder="https://tools.example.com/orders",
            key=f"manual_tool_endpoint_{key_suffix}",
        )
        auth = st.selectbox(
            "Authentication",
            ("None", "API key"),
            key=f"manual_tool_auth_{key_suffix}",
        )
        if auth == "API key":
            st.text_input(
                "Secret reference",
                placeholder="ORDER_TOOL_API_KEY",
                key=f"manual_tool_secret_{key_suffix}",
            )
        signature = (name.strip(), description.strip(), endpoint.strip(), auth)
        verified_key = f"demo_manual_verified_signature_{key_suffix}"
        if st.button("Test configuration", key=f"manual_tool_test_{key_suffix}"):
            if name.strip() and description.strip() and endpoint.strip().startswith(("http://", "https://")):
                st.session_state[verified_key] = signature
            else:
                st.session_state[verified_key] = None
        verified = st.session_state.get(verified_key) == signature
        if verified:
            st.success("Configuration verified. The Tool responded successfully.")
        elif st.session_state.get(verified_key) is None and any(signature[:3]):
            st.caption("Enter a valid Tool name, description, and HTTP(S) URL, then test again.")
        if st.button(
            "Add tool",
            type="primary",
            disabled=not verified,
            key=f"manual_tool_add_{key_suffix}",
        ):
            custom_id = f"custom_{len(state['custom_tools']) + 1}"
            state["custom_tools"].append(
                {
                    "id": custom_id,
                    "name": name.strip(),
                    "description": description.strip(),
                    "source": "Manual setup",
                    "endpoint": endpoint.strip(),
                    "approval": False,
                    "enabled": True,
                    "status": "Ready",
                }
            )
            st.toast("Custom Tool added.")
            st.rerun()


def _render_assistant_console(agent: AgentProfile) -> None:
    """Render hard-coded Assistant identity and interactive Tool management."""
    _init_demo_tool_state(agent.agent_id)
    app_code = _demo_app_code(agent)
    about, tools_column = st.columns([0.9, 1.35], vertical_alignment="top")
    with about:
        with st.container(border=True):
            st.markdown("<span class='home-about-marker'></span>", unsafe_allow_html=True)
            st.markdown("<div class='home-card-heading'>About this assistant</div>", unsafe_allow_html=True)
            st.markdown(
                """
                <div class="home-purpose">
                  <small>PURPOSE</small>
                  <p>Protect high-risk actions by checking permissions first.</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown(
                f"""
                <div class="home-agent-metadata">
                  <div><small>APP CODE</small><strong class="app-code">{app_code}</strong></div>
                  <div><small>AGENT VERSION</small><strong>v{agent.current_revision}</strong></div>
                  <div><small>AI MODEL</small><strong>DeepSeek V4</strong></div>
                  <div><small>LAST UPDATED</small><strong>2 hours ago</strong></div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            with st.expander("View instructions"):
                st.caption(
                    "Check permissions before high-risk actions, request confirmation when required, "
                    "and record the outcome of every Tool call."
                )

    with tools_column:
        with st.container(border=True):
            st.markdown("<span class='home-tools-marker'></span>", unsafe_allow_html=True)
            tools = _connected_demo_tools(agent.agent_id)
            heading, action = st.columns([4, 1.35], vertical_alignment="center")
            heading.markdown(
                f"<div class='home-card-heading'>Tools <span>{len(tools)} connected</span></div>",
                unsafe_allow_html=True,
            )
            if action.button(
                "Manage tools",
                width="stretch",
                key=f"manage_demo_tools_{agent.agent_id}",
            ):
                _manage_tools_dialog(agent.agent_id)
            if not tools:
                st.info("No Tools selected. Open Manage tools to add one.")
            for index, tool in enumerate(tools):
                info, state, detail = st.columns([4.2, 1.2, 0.45], vertical_alignment="center")
                info.markdown(f"**{tool['name']}**")
                info.caption(str(tool["description"]))
                state.markdown("<span class='tool-ready-badge'>● Ready</span>", unsafe_allow_html=True)
                if bool(tool.get("approval", False)):
                    state.caption("Approval")
                if detail.button(
                    "›",
                    key=f"open_demo_tool_{agent.agent_id}_{tool['id']}",
                    type="tertiary",
                    help=f"View {tool['name']} configuration",
                ):
                    _tool_details_dialog(tool, agent.agent_id)
                if index < len(tools) - 1:
                    st.divider()


def _selected_agent(agents: Sequence[AgentProfile], default_agent_id: str) -> AgentProfile:
    agent_ids = {agent.agent_id for agent in agents}
    selected_id = st.session_state.get("selected_agent_id")
    if selected_id not in agent_ids:
        select_agent(default_agent_id if default_agent_id in agent_ids else agents[0].agent_id)
        selected_id = st.session_state.selected_agent_id
    return next(agent for agent in agents if agent.agent_id == selected_id)


def _select_agent_from_home() -> None:
    """Apply Agent-route cleanup after the selector updates its durable context."""
    select_agent(st.session_state.selected_agent_id)


def render_agent_home(
    registry: AgentRegistry | None,
    repository: WorkbenchRepository,
    *,
    default_agent_id: str,
) -> None:
    """Render one persisted Agent and the immutable evidence attached to it."""
    del registry  # Agent Home selects existing immutable Agents; it does not create them.
    agents = valid_agents(repository)
    if not agents:
        st.title("Home")
        st.info("No AI assistants are ready yet.")
        return

    selected = _selected_agent(agents, default_agent_id)
    agent_ids = [agent.agent_id for agent in agents]
    names = {
        agent.agent_id: f"◉  {agent.name}  ·  {_demo_app_code(agent)}"
        for agent in agents
    }
    st.markdown("<div class='assistant-picker-label'>AI ASSISTANT</div>", unsafe_allow_html=True)
    picker, action, _ = st.columns([3.4, 1.15, 1.45], vertical_alignment="center")
    with picker:
        st.selectbox(
            "AI assistant",
            agent_ids,
            format_func=names.__getitem__,
            key="selected_agent_id",
            on_change=_select_agent_from_home,
            label_visibility="collapsed",
        )
    with action:
        if st.button("Run check", key="home_run_test", type="primary", width="stretch"):
            request_navigation("Dataset")
            st.rerun()
    st.caption("Checks permissions before high-risk actions.")

    selected = repository.get_agent(st.session_state.selected_agent_id)
    reports = repository.list_reports(selected.agent_id)

    _render_demo_result(reports[0] if reports else None)
    _render_assistant_console(selected)


def render_agents_page(
    registry: AgentRegistry,
    repository: WorkbenchRepository,
    *,
    demo_trace_path: Path,
    runner: object | None = None,
    report_service: object | None = None,
    llm_generate: object | None = None,
    langfuse_base_url: str | None = None,
) -> None:
    """Compatibility wrapper retained until the global shell moves to Agent Home."""
    del demo_trace_path, runner, report_service, llm_generate, langfuse_base_url
    render_agent_home(registry, repository, default_agent_id=st.session_state.selected_agent_id)
