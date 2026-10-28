"""Small, accessible Plotly figures for immutable report summaries."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import plotly.graph_objects as go


PRIMARY = "#176B55"
PRIMARY_LIGHT = "#A9D3C1"
CREAM = "#EADCB8"
INK = "#17201E"
GRID = "#DCE3DF"


def _layout(figure: go.Figure, *, height: int = 270) -> go.Figure:
    figure.update_layout(
        height=height,
        margin=dict(l=8, r=18, t=12, b=16),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Arial, Helvetica, sans-serif", color=INK, size=12),
        showlegend=False,
    )
    return figure


def judge_figure(dimensions: Mapping[str, float]) -> go.Figure:
    """Build the fixed 1–5 Judge rubric chart with visible value labels."""
    keys = ("correctness", "relevance", "completeness", "safety")
    labels = [name.title() for name in keys]
    values = [float(dimensions.get(name, 0.0)) for name in keys]
    figure = go.Figure(
        go.Bar(
            x=values,
            y=labels,
            orientation="h",
            marker_color=[PRIMARY, PRIMARY_LIGHT, PRIMARY, PRIMARY_LIGHT],
            text=[f"{value:.1f}" for value in values],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}: %{x:.1f}/5<extra></extra>",
        )
    )
    figure.update_xaxes(range=[0, 5.45], tickvals=[1, 2, 3, 4, 5], gridcolor=GRID)
    figure.update_yaxes(autorange="reversed")
    return _layout(figure)


def tool_funnel_figure(funnel: Mapping[str, int]) -> go.Figure:
    """Build the Requested → Verified evidence funnel as labelled bars."""
    keys = ("requested", "executed", "succeeded", "verified")
    labels = [name.title() for name in keys]
    values = [int(funnel.get(name, 0)) for name in keys]
    figure = go.Figure(
        go.Bar(
            x=labels,
            y=values,
            marker_color=[PRIMARY, "#34826D", "#6AA38F", "#A9D3C1"],
            text=[str(value) for value in values],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{x}: %{y}<extra></extra>",
        )
    )
    figure.update_yaxes(rangemode="tozero", gridcolor=GRID, dtick=1)
    return _layout(figure)


def cost_figure(costs: Mapping[str, float | None]) -> go.Figure:
    """Show recorded Agent/Judge costs without inventing missing zero values."""
    values_by_label = [
        ("Agent", costs.get("agent")),
        ("Judge", costs.get("judge")),
    ]
    recorded = [
        (label, float(value)) for label, value in values_by_label
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    ]
    labels = [label for label, _ in recorded]
    values = [value for _, value in recorded]
    figure = go.Figure(
        go.Bar(
            x=labels,
            y=values,
            marker_color=[PRIMARY, CREAM],
            text=[f"${value:.4f}" for value in values],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{x}: $%{y:.4f}<extra></extra>",
        )
    )
    figure.update_yaxes(rangemode="tozero", gridcolor=GRID, tickprefix="$")
    return _layout(figure)


def _chronological_rows(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Turn newest-first Report history into chronological chart points."""
    return list(reversed(rows))


def quality_trend_figure(rows: Sequence[Mapping[str, Any]]) -> go.Figure:
    """Plot immutable Report pass rates from oldest to newest."""
    points = _chronological_rows(rows)
    figure = go.Figure(
        go.Scatter(
            x=[point["Time"] for point in points],
            y=[float(point["Pass rate"]) for point in points],
            mode="lines+markers",
            line=dict(color=PRIMARY, width=3),
            marker=dict(color=PRIMARY, size=8),
            hovertemplate="%{x}<br>Pass rate: %{y:.1f}%<extra></extra>",
        )
    )
    figure.update_yaxes(range=[0, 100], gridcolor=GRID, ticksuffix="%")
    figure.update_xaxes(gridcolor=GRID)
    return _layout(figure, height=220)


def cost_trend_figure(rows: Sequence[Mapping[str, Any]]) -> go.Figure:
    """Plot immutable evaluation costs from oldest to newest."""
    points = [
        point for point in _chronological_rows(rows) if point.get("Cost") is not None
    ]
    figure = go.Figure(
        go.Scatter(
            x=[point["Time"] for point in points],
            y=[float(point["Cost"]) for point in points],
            mode="lines+markers",
            line=dict(color=CREAM, width=3),
            marker=dict(color=CREAM, size=8),
            hovertemplate="%{x}<br>Evaluation cost: $%{y:.4f}<extra></extra>",
        )
    )
    figure.update_yaxes(rangemode="tozero", gridcolor=GRID, tickprefix="$")
    figure.update_xaxes(gridcolor=GRID)
    return _layout(figure, height=220)
