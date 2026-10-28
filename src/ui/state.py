"""Small, transient UI state helpers.

Product records always remain in SQLite; session state only remembers navigation
and in-progress editor choices.
"""
from __future__ import annotations

import streamlit as st


PAGES = ("Agent", "Dataset", "Evaluation", "Report", "Settings")
_PAGE_SELECTION_KEYS = (
    "selected_dataset_id",
    "selected_dataset_revision_id",
    "selected_run_id",
    "selected_report_id",
)
_TRANSIENT_STATE_PREFIXES = (
    "dataset_editor_",
    "dataset_import_open_",
    "dataset_llm_error_",
    "dataset_llm_notice_",
    "dataset_review_",
    "dataset_review_source_",
    "run_published_dataset_",
)


def init_ui_state(default_agent_id: str | None = None) -> None:
    """Initialize transient route state without changing an active session."""
    defaults = {
        "selected_agent_id": default_agent_id,
        "active_page": "Agent",
        "agent_dialog": None,
        "tool_editor": None,
        "demo_preview_notice": None,
        "demo_reset_confirm": False,
        "demo_reset_pending": False,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)
    pending_page = st.session_state.pop("pending_page", None)
    if pending_page in PAGES:
        st.session_state.active_page = pending_page
    if st.session_state.active_page not in PAGES:
        st.session_state.active_page = "Agent"
    if st.session_state.demo_reset_pending:
        reset_demo_state(default_agent_id)


def navigate(page: str) -> None:
    """Select a valid global workbench route."""
    if page not in PAGES:
        raise ValueError(f"Unknown workbench page: {page}")
    if st.session_state.get("active_page") == page:
        return
    st.session_state.active_page = page


def request_navigation(page: str) -> None:
    """Apply a route before sidebar widget construction on the next rerun."""
    if page not in PAGES:
        raise ValueError(f"Unknown workbench page: {page}")
    st.session_state.pending_page = page


def _clear_page_selections() -> None:
    for key in _PAGE_SELECTION_KEYS:
        st.session_state.pop(key, None)


def _clear_transient_editor_and_review_state() -> None:
    for key in ("agent_dialog", "tool_editor", "demo_preview_notice"):
        st.session_state[key] = None
    for key in tuple(st.session_state):
        if key.startswith(_TRANSIENT_STATE_PREFIXES):
            st.session_state.pop(key, None)


def reset_demo_state(default_agent_id: str | None = None) -> None:
    """Restore only transient Demo presentation state."""
    _clear_page_selections()
    _clear_transient_editor_and_review_state()
    st.session_state.selected_agent_id = default_agent_id
    navigate("Agent")
    st.session_state.demo_reset_confirm = False
    st.session_state.demo_reset_pending = False


def select_agent(agent_id: str) -> None:
    """Open an Agent from the global Agent route with a clean page context."""
    _clear_page_selections()
    st.session_state.selected_agent_id = agent_id
    navigate("Agent")
