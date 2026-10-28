"""Roadmap feature placeholder cards (not yet implemented).

Each card explains what the feature does, how it will work once built,
and shows a disabled preview of its future controls.
"""
from __future__ import annotations

from typing import Callable

import streamlit as st


def render_roadmap_card(title: str, what: str, how: str,
                        controls: Callable[[], None]) -> None:
    """Uniform roadmap card: title + COMING SOON badge, what/how, disabled controls."""
    with st.container(border=True):
        st.markdown(f"#### {title} · `COMING SOON`")
        st.markdown(f"**What it does:** {what}")
        st.markdown(f"**How it will work:** {how}")
        controls()


def render_adversarial_dataset_card() -> None:
    def controls() -> None:
        st.multiselect(
            "Attack types",
            ["prompt injection", "jailbreak", "role escalation"],
            default=["prompt injection"], disabled=True)
        st.slider("Cases per attack type", 1, 20, 5, disabled=True)
        st.button("Generate adversarial cases", disabled=True)

    render_roadmap_card(
        "Adversarial Dataset Generation",
        "Auto-generate attack cases (prompt injection, jailbreak, role "
        "escalation) to stress-test the Permission Guard.",
        "The dataset will gain an `adversarial` scenario class, and compliance "
        "scores will show whether the guard holds up under attack.",
        controls)


def render_multi_turn_card() -> None:
    def controls() -> None:
        st.toggle("Enable multi-turn sessions", disabled=True)
        st.slider("Turns per session", 2, 10, 4, disabled=True)

    render_roadmap_card(
        "Multi-turn Conversations",
        "Evaluate multi-turn sessions, e.g. privilege-escalation attempts "
        "spread across turns.",
        "Dataset items will carry a conversation script instead of a single "
        "query, and traces will contain one span tree per turn.",
        controls)


def render_real_tools_card() -> None:
    def controls() -> None:
        for tool, url in [
            ("WeatherTool", "https://api.weather.example/v1"),
            ("EmployeeQueryTool", "https://hr.internal.example/api"),
            ("SystemRestartTool", "https://ops.internal.example/restart"),
        ]:
            c1, c2 = st.columns([3, 1])
            c1.text_input(f"{tool} endpoint", value=url, disabled=True)
            c2.toggle(f"{tool}: use real API", disabled=True)

    render_roadmap_card(
        "Real Tool Calls",
        "Replace the mock tools with real API integrations.",
        "The `tool_execution` spans will show real latency and real errors, "
        "and `execution_correctness` will validate against live responses.",
        controls)


def render_standalone_guard_card() -> None:
    def controls() -> None:
        st.text_input("Guard endpoint URL",
                      value="https://guard.internal.example/check",
                      disabled=True)
        st.button("Deploy guard service", disabled=True)

    render_roadmap_card(
        "Standalone Permission Guard",
        "Deploy the Permission Guard as a separate service so policies are "
        "managed centrally across agents.",
        "The `permission_guard` span will become a remote call; the evaluator "
        "rules stay unchanged because the span contract is preserved.",
        controls)


def render_llm_judge_card() -> None:
    def controls() -> None:
        st.selectbox("Judge model",
                     ["deepseek-v4-pro[1m]", "deepseek-v4-flash", "gpt-4o-mini"],
                     disabled=True)
        st.text_area(
            "Rubric",
            value="Score 0-1: Is the refusal polite? Is the answer grounded "
                  "in the tool output?",
            disabled=True)
        st.button("Run LLM Judge", disabled=True)

    render_roadmap_card(
        "LLM-as-Judge",
        "Add subjective response-quality scoring by an LLM, covering what "
        "deterministic rules cannot judge.",
        "Every trace will gain a third score `llm_judge_quality`, shown "
        "alongside permission_compliance and execution_correctness.",
        controls)


def render_reflector_card() -> None:
    def controls() -> None:
        st.slider("Max optimization iterations", 1, 10, 3, disabled=True)
        st.button("Analyze failures & suggest fixes", disabled=True)

    render_roadmap_card(
        "Reflector Auto-optimization",
        "Close the loop: analyze failing cases, attribute root causes, "
        "generate improvement suggestions, and re-run the evaluation.",
        "This tab will gain an optimization history section showing each "
        "iteration's score delta and the applied fix.",
        controls)
