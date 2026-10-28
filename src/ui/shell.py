"""Global navigation shell for the modular workbench."""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_models import AgentProfile, AgentRevision
from src.workbench_repository import WorkbenchRepository

from .agents import render_agent_home
from .datasets import CandidateGenerator, render_datasets_module
from .reports import render_reports_module
from .runs import render_runs_module
from .settings_page import SettingsStatus, render_settings_page
from .state import PAGES, init_ui_state, navigate


_NAV_LABELS = {
    "Agent": "Home",
    "Dataset": "Test sets",
    "Evaluation": "Run test",
    "Report": "Results",
    "Settings": "Settings",
}


def _show_reset_confirmation() -> None:
    st.session_state.demo_reset_confirm = True


def _request_demo_reset() -> None:
    st.session_state.demo_reset_pending = True


def _cancel_demo_reset() -> None:
    st.session_state.demo_reset_confirm = False


def locked_agent(
    repository: WorkbenchRepository, selected_agent_id: str | None
) -> AgentProfile | None:
    """Return an evaluation-ready selected Agent, or no locked context."""
    context = _locked_agent_context(repository, selected_agent_id)
    return context[0] if context is not None else None


def _locked_agent_context(
    repository: WorkbenchRepository, selected_agent_id: str | None
) -> tuple[AgentProfile, AgentRevision] | None:
    """Resolve the Agent and its current immutable revision atomically for routing."""
    if not selected_agent_id:
        return None
    try:
        agent = repository.get_agent(selected_agent_id)
        if agent.current_revision <= 0:
            return None
        revision = repository.get_current_agent_revision(agent.agent_id)
    except KeyError:
        return None
    if (
        revision is None
        or revision.agent_id != agent.agent_id
        or revision.revision != agent.current_revision
    ):
        return None
    return agent, revision


def render_agent_context(agent: AgentProfile, revision: AgentRevision | None) -> None:
    """Keep the selected assistant visible without exposing internal versioning."""
    del revision
    st.markdown(
        f"<div class='workspace-bar'><span>AI ASSISTANT</span><strong>{agent.name}</strong></div>",
        unsafe_allow_html=True,
    )


def _default_settings_status() -> SettingsStatus:
    return SettingsStatus(
        llm="Not configured",
        langfuse="Not configured",
        database="Available",
        demo_fixture="Available",
    )


def render_shell(
    registry: AgentRegistry,
    repository: WorkbenchRepository,
    *,
    default_agent_id: str | None = None,
    runner_provider: Callable[[str], object | None] | None = None,
    settings_status: SettingsStatus | None = None,
    # Compatibility arguments keep the pre-Task-8 application caller runnable.
    demo_trace_path: Path | None = None,
    runner: object | None = None,
    report_service: object | None = None,
    llm_generate: CandidateGenerator | None = None,
    langfuse_base_url: str | None = None,
) -> None:
    """Render the fixed global shell and dispatch to the active page."""
    del demo_trace_path
    init_ui_state(default_agent_id=default_agent_id)
    resolve_runner = runner_provider or (lambda _agent_id: runner)
    status = settings_status or _default_settings_status()
    requested_page = st.session_state.active_page
    context = (
        _locked_agent_context(repository, st.session_state.selected_agent_id)
        if requested_page not in {"Agent", "Settings"}
        else None
    )
    if requested_page not in {"Agent", "Settings"} and context is None:
        # This must happen before the radio widget is created: Streamlit does not
        # allow a widget's session-state key to change after instantiation.
        navigate("Agent")
        st.session_state.agent_context_warning = "Select an Agent to continue."
    with st.sidebar:
        st.markdown("<div class='brand-mark'>EVAL STUDIO</div>", unsafe_allow_html=True)
        st.caption("AI TESTING")
        page = st.radio(
            "Global navigation",
            PAGES,
            key="active_page",
            format_func=_NAV_LABELS.__getitem__,
            label_visibility="collapsed",
        )
        st.markdown("<div class='sidebar-spacer'></div>", unsafe_allow_html=True)
        with st.expander("Demo options"):
            st.button(
                "Reset sample data",
                key="reset_demo",
                width="stretch",
                on_click=_show_reset_confirmation,
            )
            if st.session_state.demo_reset_confirm:
                st.caption("Reset the sample view?")
                confirm, cancel = st.columns(2)
                confirm.button(
                    "Reset",
                    key="confirm_reset_demo",
                    width="stretch",
                    on_click=_request_demo_reset,
                )
                cancel.button(
                    "Cancel",
                    key="cancel_reset_demo",
                    width="stretch",
                    on_click=_cancel_demo_reset,
                )
    pending_warning = st.session_state.pop("agent_context_warning", None)
    if pending_warning:
        st.warning(pending_warning)

    if page == "Agent":
        render_agent_home(
            registry, repository, default_agent_id=default_agent_id or ""
        )
        return
    if page == "Settings":
        render_settings_page(status)
        return

    if context is None:  # pragma: no cover - pre-radio normalization handles this route.
        return
    agent, revision = context
    if page == "Dataset":
        render_datasets_module(repository, agent.agent_id, llm_generate)
    elif page == "Evaluation":
        render_agent_context(agent, revision)
        render_runs_module(
            repository,
            agent.agent_id,
            resolve_runner(agent.agent_id),
            report_service,
        )
    elif page == "Report":
        render_agent_context(agent, revision)
        render_reports_module(
            repository,
            agent.agent_id,
            report_service,
            runner=resolve_runner(agent.agent_id),
            langfuse_base_url=langfuse_base_url,
        )
