"""Immutable Report history, result-first visualization, and comparison UI."""
from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable, Mapping
from html import escape
from typing import Any

import streamlit as st
import pandas as pd

from src.workbench_models import ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .charts import cost_figure, judge_figure, tool_funnel_figure


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _number_or_none(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _run_result(value: Any) -> Any:
    return asyncio.run(value) if inspect.isawaitable(value) else value


def _judge_average(value: Any) -> float | None:
    judge = _mapping(value)
    if not judge:
        return None
    if "average" in judge:
        return _number_or_none(judge["average"])
    scores = _mapping(judge.get("scores"))
    return sum(float(score) for score in scores.values()) / len(scores) if scores else None


def _effect_status(evidence: Mapping[str, Any]) -> str:
    if not evidence.get("verification_required", False):
        return "NOT REQUIRED"
    return "VERIFIED" if evidence.get("effect_verified") is True else "UNVERIFIED"


def report_view_model(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize immutable summary data without manufacturing optional evidence."""
    cases: list[dict[str, Any]] = []
    tool_evidence: list[dict[str, Any]] = []
    case_counts = {"PASS": 0, "FAIL": 0, "INCOMPLETE": 0}
    for case in summary.get("cases", ()):
        item = _mapping(case)
        status = str(item.get("status", "INCOMPLETE"))
        average = _judge_average(item.get("judge"))
        status_label = {
            "PASS": "✓ PASS",
            "FAIL": "✕ FAIL",
            "INCOMPLETE": "— INCOMPLETE",
        }.get(status, f"— {status}")
        cases.append({
            "Case": str(item.get("case_id", "")),
            "Status": status_label,
            "Judge score": f"{average:.2f}" if average is not None else "Not available",
            "Trace": str(item.get("trace_id", "")),
        })
        case_counts[status] = case_counts.get(status, 0) + 1
        for evidence in item.get("tool_evidence", ()):
            evidence_item = _mapping(evidence)
            tool_evidence.append({
                "Case": str(item.get("case_id", "")),
                "Tool": str(evidence_item.get("tool_id", "Unknown")),
                "Requested": "YES" if evidence_item.get("requested") else "NO",
                "Executed": "YES" if evidence_item.get("executed") else "NO",
                "Succeeded": "YES" if evidence_item.get("succeeded") else "NO",
                "Effect verification": _effect_status(evidence_item),
            })

    metrics = _mapping(summary.get("metrics"))
    stored_pass_rate = _number_or_none(metrics.get("pass_rate"))
    pass_rate = stored_pass_rate if stored_pass_rate is not None else (
        case_counts["PASS"] / len(cases) * 100 if cases else 0.0
    )
    costs = _mapping(summary.get("costs"))
    normalized_costs = {
        "Agent": _number_or_none(costs.get("agent")),
        "Judge": _number_or_none(costs.get("judge")),
        "Evaluation total": _number_or_none(costs.get("evaluation_total")),
        "Dataset (excluded)": _number_or_none(costs.get("dataset")),
    }
    tokens = {
        str(name): _number_or_none(value) for name, value in _mapping(summary.get("tokens")).items()
    }
    judge_dimensions = _mapping(summary.get("judge_dimensions"))
    return {
        "status": str(summary.get("status", "INCOMPLETE")),
        "cases": cases,
        "case_counts": case_counts,
        "pass_rate": pass_rate,
        "tool_evidence": tool_evidence,
        "tool_funnel": _mapping(summary.get("tool_funnel")),
        "judge_dimensions": judge_dimensions,
        "judge_available": bool(judge_dimensions),
        "costs": normalized_costs,
        "tokens": tokens,
        "usage_available": any(value is not None for value in tokens.values()) or any(
            value is not None for value in normalized_costs.values()
        ),
        "failures": list(summary.get("failures", ())),
    }


def comparison_view_model(comparison: Any) -> dict[str, Any]:
    """Expose every comparison group without inventing unmatched-case rates."""
    return {
        "Shared-case pass rate delta": float(comparison.pass_rate_delta_shared),
        "Different dataset revisions": bool(comparison.different_dataset_revisions),
        "Agent changes": dict(comparison.agent_changes),
        "Judge score deltas": dict(comparison.judge_deltas),
        "Tool-state changes": dict(comparison.tool_state_deltas),
        "Token deltas": dict(comparison.token_deltas),
        "Cost delta": _number_or_none(comparison.cost_delta_usd),
        "Resolved failures": tuple(comparison.resolved_failure_ids),
        "Regressions": tuple(comparison.regression_ids),
        "Unchanged failures": tuple(comparison.unchanged_failure_ids),
        "Added cases": tuple(comparison.added_case_ids),
        "Removed cases": tuple(comparison.removed_case_ids),
        "Shared cases": tuple(comparison.shared_case_ids),
    }


def _format_reason(value: Any) -> str:
    if isinstance(value, Mapping):
        return "; ".join(f"{key}: {item}" for key, item in value.items()) or "No reason recorded"
    if isinstance(value, (list, tuple)):
        return "; ".join(str(item) for item in value) or "No reason recorded"
    return str(value) if value else "No reason recorded"


def render_result_kpis(view: Mapping[str, Any]) -> None:
    counts = _mapping(view.get("case_counts"))
    columns = st.columns(4)
    columns[0].metric("Pass Rate", f"{float(view['pass_rate']):.1f}%")
    columns[1].metric("Passed", int(counts.get("PASS", 0)))
    columns[2].metric("Failed", int(counts.get("FAIL", 0)))
    columns[3].metric("Incomplete", int(counts.get("INCOMPLETE", 0)))


def render_case_results(view: Mapping[str, Any]) -> None:
    st.markdown("#### All questions")
    if view["cases"]:
        rows = pd.DataFrame(view["cases"])
        st.dataframe(rows.style.map(case_status_style, subset=["Status"]), width="stretch", hide_index=True)
    else:
        st.info("No case results are stored in this Report.")


def case_status_style(status: str) -> str:
    """Style literal case-result statuses without obscuring their text."""
    if "PASS" in status:
        return "color: #176B55; font-weight: 700"
    if "FAIL" in status:
        return "color: #B3261E; font-weight: 700"
    return ""


def judge_diagnosis(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Create a short, honest Judge diagnosis, including offline fallback results."""
    cases = [_mapping(item) for item in summary.get("cases", ())]
    failed = [item for item in cases if str(item.get("status")) != "PASS"]
    judges = [_mapping(item.get("judge")) for item in cases]
    fallback = not any(judges) or any(
        str(judge.get("model", "")).casefold().startswith("default fallback")
        for judge in judges
        if judge
    )
    findings: list[str] = []
    for item in failed[:3]:
        judge = _mapping(item.get("judge"))
        summary_text = str(judge.get("summary", "")).strip()
        if not summary_text:
            summary_text = _format_reason(item.get("deterministic_reasons"))
        findings.append(f"{item.get('case_id', 'Question')}: {summary_text}")
    if failed:
        headline = f"{len(failed)} of {len(cases)} questions need attention."
        tone = "fail"
    else:
        headline = f"All {len(cases)} questions passed the available checks."
        tone = "pass"
        findings.append(
            "Responses matched the expected behavior and no permission violation was found."
        )
    note = (
        "The Judge connection was unavailable, so default case analysis was used."
        if fallback
        else "The configured LLM Judge reviewed the responses and Tool evidence."
    )
    return {
        "headline": headline,
        "findings": findings,
        "fallback": fallback,
        "note": note,
        "tone": tone,
    }


def render_judge_analysis(summary: Mapping[str, Any]) -> None:
    diagnosis = judge_diagnosis(summary)
    passed = diagnosis["tone"] == "pass"
    background = "#F0F7F3" if passed else "#FFF2F0"
    color = "#176B55" if passed else "#B3261E"
    icon = "✓" if passed else "!"
    badge = (
        "<span style='margin-left:8px;padding:3px 7px;border-radius:999px;"
        "background:#FBF4E4;color:#80540C;font-size:10px;font-weight:700;'>"
        "DEFAULT ANALYSIS</span>"
        if diagnosis["fallback"]
        else ""
    )
    findings = "".join(
        f"<li>{escape(str(finding))}</li>" for finding in diagnosis["findings"]
    )
    dimensions = _mapping(summary.get("judge_dimensions"))
    score_cards = "".join(
        "<div style='background:#FFFFFF;border:1px solid #DCE3DF;border-radius:8px;"
        "padding:8px 10px;min-width:112px;'>"
        f"<div style='color:#6A7D76;font-size:10px;text-transform:uppercase;'>"
        f"{escape(name.title())}</div>"
        f"<div style='color:#20312C;font-size:16px;font-weight:750;'>"
        f"{float(dimensions[name]):.1f}<span style='font-size:11px;color:#6A7D76;'>/5</span>"
        "</div></div>"
        for name in ("correctness", "relevance", "completeness", "safety")
        if name in dimensions
    )
    st.markdown("#### LLM as a judge")
    st.markdown(
        f"<div style='background:{background};border:1px solid {color}4D;"
        "border-radius:14px;padding:18px;margin-bottom:18px;'>"
        "<div style='color:#6A7D76;font-size:10px;font-weight:750;letter-spacing:.08em;"
        "text-transform:uppercase;margin-bottom:6px;'>LLM Judge response</div>"
        f"<div style='color:{color};font-weight:780;font-size:16px;'>"
        f"{icon} {escape(str(diagnosis['headline']))}{badge}</div>"
        "<div style='color:#6A7D76;font-size:11px;font-weight:700;text-transform:uppercase;"
        "margin-top:16px;'>Reviewed inputs</div>"
        "<div style='color:#33443F;font-size:12px;margin-top:4px;'>"
        "Agent response · Expected output · Permission result · Tool evidence</div>"
        "<div style='color:#6A7D76;font-size:11px;font-weight:700;text-transform:uppercase;"
        "margin-top:16px;'>Score breakdown</div>"
        f"<div style='display:flex;flex-wrap:wrap;gap:8px;margin-top:7px;'>{score_cards}</div>"
        "<div style='color:#6A7D76;font-size:11px;font-weight:700;text-transform:uppercase;"
        "margin-top:16px;'>Findings</div>"
        f"<ul style='margin:7px 0 0;padding-left:20px;color:#33443F;font-size:13px;'>"
        f"{findings}</ul>"
        f"<div style='color:#587269;font-size:11px;margin-top:12px;'>"
        f"{escape(str(diagnosis['note']))}</div></div>",
        unsafe_allow_html=True,
    )


def render_failure_reasons(view: Mapping[str, Any], langfuse_base_url: str | None) -> None:
    if not view["failures"]:
        return
    st.markdown("#### Failed questions")
    for failure in view["failures"]:
        item = _mapping(failure)
        case_id = str(item.get("case_id", "Unknown case"))
        status = str(item.get("status", "INCOMPLETE"))
        color = "#176B55" if status == "PASS" else "#B3261E" if status == "FAIL" else "#485B55"
        icon = "✓" if status == "PASS" else "✕" if status == "FAIL" else "—"
        status = f"{icon} {status}"
        with st.container(border=True):
            st.markdown(
                f"<span style='color:{color};font-weight:700'>{status}</span> · {case_id}",
                unsafe_allow_html=True,
            )
            deterministic = item.get("deterministic_reasons", item.get("deterministic_reason_codes"))
            st.caption(_format_reason(deterministic))
            with st.expander("More details"):
                st.caption(f"AI review: {_format_reason(item.get('judge_reasons'))}")
                st.caption(f"Action check: {_format_reason(item.get('failed_tool_states'))}")
                trace_id = str(item.get("trace_id", ""))
                if langfuse_base_url and trace_id:
                    st.markdown(f"[View technical trace]({langfuse_base_url.rstrip('/')}/trace/{trace_id})")
                elif trace_id:
                    st.caption(f"Trace: {trace_id}")


def render_tool_evidence(view: Mapping[str, Any]) -> None:
    st.plotly_chart(
        tool_funnel_figure(_mapping(view.get("tool_funnel"))),
        width="stretch", config={"displayModeBar": False},
    )
    st.dataframe(view["tool_evidence"], width="stretch", hide_index=True)


def _format_cost(value: float | None) -> str:
    return f"${value:.4f}" if value is not None else "Not available"


def _format_delta(value: float | int | None, format_spec: str) -> str:
    return format(value, format_spec) if value is not None else "Not available"


def render_usage_and_cost(view: Mapping[str, Any]) -> None:
    st.markdown("#### Token totals")
    token_rows = [
        {"Token total": name.replace("_", " ").title(), "Tokens": int(value)}
        for name, value in view["tokens"].items() if value is not None
    ]
    if token_rows:
        st.dataframe(token_rows, width="stretch", hide_index=True)
    else:
        st.caption("Token totals: Not available")
    costs = _mapping(view["costs"])
    if costs.get("Agent") is not None or costs.get("Judge") is not None:
        st.markdown("#### Agent and Judge costs")
        st.plotly_chart(
            cost_figure({"agent": costs.get("Agent"), "judge": costs.get("Judge")}),
            width="stretch", config={"displayModeBar": False},
        )
    st.markdown("#### Cost scope")
    for column, (label, value) in zip(st.columns(4), costs.items(), strict=True):
        column.metric(label, _format_cost(value))
    st.caption("Agent and Judge are included in Evaluation Total. Dataset Generation is excluded.")


def render_report_summary(
    summary: Mapping[str, Any],
    *,
    langfuse_base_url: str | None = None,
    judge_action: Callable[[], None] | None = None,
    judge_disabled: bool = False,
    judge_key: str = "report_llm_judge",
) -> None:
    """Render the decision first and hide technical evidence by default."""
    view = report_view_model(summary)
    identity = _mapping(summary.get("identity"))
    agent = _mapping(identity.get("agent"))
    dataset = _mapping(identity.get("dataset"))
    st.caption(
        f"{agent.get('name', 'AI assistant')} · {dataset.get('name', 'Test set')}"
    )
    st.markdown("## Summary")
    render_result_kpis(view)
    if view["judge_available"]:
        render_judge_analysis(summary)
    elif judge_action is not None:
        if st.button(
            "LLM as judge",
            key=judge_key,
            disabled=judge_disabled,
        ):
            judge_action()
    render_failure_reasons(view, langfuse_base_url)
    render_case_results(view)
    with st.expander("Technical details"):
        st.markdown("#### Tool activity")
        if view["tool_evidence"]:
            render_tool_evidence(view)
        else:
            st.caption("Not available")
        st.markdown("#### AI scoring")
        if view["judge_available"]:
            st.plotly_chart(
                judge_figure(_mapping(view["judge_dimensions"])),
                width="stretch", config={"displayModeBar": False},
            )
        else:
            st.caption("Not available")


def _report_label(report: ReportSnapshot) -> str:
    identity = _mapping(report.summary.get("identity"))
    dataset = _mapping(identity.get("dataset"))
    return (
        f"{report.created_at} · {report.status} · {dataset.get('name', 'Dataset')} "
        f"R{dataset.get('revision', '—')} · artifact {report.artifact_version}"
    )


def _fallback_compare(repository: WorkbenchRepository, baseline: ReportSnapshot, current: ReportSnapshot) -> Any:
    from src.report_compare import compare_report_summaries

    baseline_run = repository.get_run(baseline.run_id)
    current_run = repository.get_run(current.run_id)
    baseline_config = repository.get_agent_revision(baseline_run.agent_revision_id).config_snapshot
    current_config = repository.get_agent_revision(current_run.agent_revision_id).config_snapshot
    return compare_report_summaries(
        baseline.report_id, dict(baseline.summary), dict(baseline_config),
        current.report_id, dict(current.summary), dict(current_config),
    )


def _render_id_group(label: str, values: tuple[str, ...], empty: str) -> None:
    st.markdown(f"**{label}**")
    st.caption(", ".join(values) if values else empty)


def render_comparison(comparison: Any) -> None:
    view = comparison_view_model(comparison)
    if view["Different dataset revisions"]:
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>Different dataset revisions</strong><br>Headline results use shared cases only; added and removed cases are listed separately."
            "</div>", unsafe_allow_html=True,
        )
    kpis = st.columns(4)
    kpis[0].metric("Shared-case pass rate delta", f"{view['Shared-case pass rate delta']:+.1f} pp")
    kpis[1].metric("Shared cases", len(view["Shared cases"]))
    kpis[2].metric(
        "Evaluation cost delta",
        f"${view['Cost delta']:+.4f}" if view["Cost delta"] is not None else "Not available",
    )
    kpis[3].metric("Regressions", len(view["Regressions"]))
    st.markdown("#### Agent configuration diff")
    changes = [
        {"Setting": key, "Baseline": str(value.get("before")), "Current": str(value.get("after"))}
        for key, value in view["Agent changes"].items()
    ]
    if changes:
        st.dataframe(changes, width="stretch", hide_index=True)
    else:
        st.caption("No tracked Agent configuration changes.")
    score, evidence, tokens = st.columns(3)
    with score:
        st.markdown("#### Judge score deltas")
        st.dataframe([{"Dimension": key.title(), "Delta": _format_delta(value, "+.2f")} for key, value in view["Judge score deltas"].items()], width="stretch", hide_index=True)
    with evidence:
        st.markdown("#### Tool-state changes")
        st.dataframe([{"State": key.title(), "Delta": f"{value:+d}"} for key, value in view["Tool-state changes"].items()], width="stretch", hide_index=True)
    with tokens:
        st.markdown("#### Token deltas")
        st.dataframe([{"Category": key, "Delta": _format_delta(value, "+d")} for key, value in view["Token deltas"].items()], width="stretch", hide_index=True)
    groups = st.columns(3)
    with groups[0]:
        _render_id_group("Resolved failures", view["Resolved failures"], "None")
        _render_id_group("Regressions", view["Regressions"], "None")
    with groups[1]:
        _render_id_group("Unchanged failures", view["Unchanged failures"], "None")
        _render_id_group("Shared cases", view["Shared cases"], "None")
    with groups[2]:
        _render_id_group("Added cases", view["Added cases"], "None")
        _render_id_group("Removed cases", view["Removed cases"], "None")


def render_reports_module(
    repository: WorkbenchRepository, agent_id: str, report_service: Any | None = None,
    *, runner: Any | None = None, langfuse_base_url: str | None = None,
) -> None:
    """Render simple results first with optional comparison and cost details."""
    reports = repository.list_reports(agent_id)
    st.subheader("Results")
    if not reports:
        with st.container(border=True):
            st.markdown("**No results yet**")
            st.caption("Run a test to see the result here.")
        return
    reports_by_id = {report.report_id: report for report in reports}
    report_ids = list(reports_by_id)
    history_key = f"report_history_{agent_id}"
    pending_history_key = f"{history_key}_pending"
    pending_report_id = st.session_state.pop(pending_history_key, None)
    if pending_report_id in reports_by_id:
        st.session_state[history_key] = pending_report_id
    selected_id = st.session_state.get("selected_report_id")
    selected_index = next((index for index, report in enumerate(reports) if report.report_id == selected_id), 0)
    selected_report_id = st.selectbox(
        "Result", report_ids, index=selected_index, key=history_key,
        format_func=lambda report_id: _report_label(reports_by_id[report_id]),
    )
    selected = reports_by_id[selected_report_id]
    st.session_state["selected_report_id"] = selected.report_id

    def run_judge() -> None:
        if runner is None or report_service is None:
            return
        try:
            with st.spinner("Running LLM Judge…"):
                judged_run = _run_result(runner.judge_run(selected.run_id))
                judged_report = report_service.create(judged_run.run_id)
        except Exception as error:
            st.error(f"LLM Judge failed: {error}")
            return
        st.session_state["selected_report_id"] = judged_report.report_id
        st.session_state[pending_history_key] = judged_report.report_id
        st.rerun()

    render_report_summary(
        selected.summary,
        langfuse_base_url=langfuse_base_url,
        judge_action=run_judge,
        judge_disabled=runner is None or report_service is None,
        judge_key=f"report_llm_judge_{selected.report_id}",
    )
    with st.expander("Compare results"):
        if len(reports) < 2:
            st.caption("Run another test to compare results.")
        else:
            baseline_ids = [report_id for report_id in report_ids if report_id != selected.report_id]
            baseline_key = f"report_baseline_{agent_id}"
            baseline_report_key = f"report_baseline_selected_{agent_id}"
            if st.session_state.get(baseline_report_key) != selected.report_id:
                st.session_state.pop(baseline_key, None)
                st.session_state[baseline_report_key] = selected.report_id
            selected_index = reports.index(selected)
            preceding_index = selected_index + 1 if selected_index + 1 < len(reports) else selected_index - 1
            default_baseline_id = reports[preceding_index].report_id
            baseline_id = st.selectbox(
                "Compare with", baseline_ids, index=baseline_ids.index(default_baseline_id),
                key=baseline_key,
                format_func=lambda report_id: _report_label(reports_by_id[report_id]),
            )
            baseline = reports_by_id[baseline_id]
            try:
                comparison = report_service.compare(baseline.report_id, selected.report_id) if report_service is not None else _fallback_compare(repository, baseline, selected)
            except (ImportError, KeyError, ValueError) as error:
                st.error(f"Comparison is unavailable: {error}")
            else:
                render_comparison(comparison)
    with st.expander("Usage and cost"):
        view = report_view_model(selected.summary)
        if view["usage_available"]:
            render_usage_and_cost(view)
        else:
            st.caption("Not available")
