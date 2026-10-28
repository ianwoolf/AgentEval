"""Read-only environment status shown by the global Settings route."""
from __future__ import annotations

from dataclasses import dataclass

import streamlit as st


@dataclass(frozen=True)
class SettingsStatus:
    """Safe-to-display service state for the local workbench environment."""

    llm: str
    langfuse: str
    database: str
    demo_fixture: str


_SAFE_STATUS_VALUES = {"Connected", "Not configured", "Available"}


def _safe_status(value: str) -> str:
    """Keep Settings informational without ever exposing configuration values."""
    return value if value in _SAFE_STATUS_VALUES else "Error (details hidden)"


def render_settings_page(status: SettingsStatus) -> None:
    """Render simple, read-only connection health for non-technical users."""
    st.title("Connections")
    st.caption("Optional services used while testing.")
    for label, value in (
        ("AI model", status.llm),
        ("Trace viewer", status.langfuse),
        ("Saved data", status.database),
        ("Sample project", status.demo_fixture),
    ):
        row_label, row_value = st.columns([2, 3])
        row_label.markdown(f"**{label}**")
        safe_value = _safe_status(value)
        display = "● Ready" if safe_value in {"Connected", "Available"} else "○ Optional"
        row_value.caption(display if safe_value != "Error (details hidden)" else "● Needs attention")
