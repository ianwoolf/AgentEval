from __future__ import annotations

from typing import Any

from backend.errors import ApiError


COMPONENTS: tuple[dict[str, Any], ...] = (
    {"id": "WeatherTool", "tool_id": "WeatherTool", "name": "WeatherTool", "kind": "tool", "description": "Query the weather of a given city", "connection_type": "tool"},
    {"id": "EmployeeQueryTool", "tool_id": "EmployeeQueryTool", "name": "EmployeeQueryTool", "kind": "tool", "description": "Query sensitive employee information", "connection_type": "tool", "verification_required": True},
    {"id": "SystemRestartTool", "tool_id": "SystemRestartTool", "name": "SystemRestartTool", "kind": "tool", "description": "Restart production services", "connection_type": "tool", "verification_required": True},
    {"id": "docs-mcp", "tool_id": "docs-mcp", "name": "Documentation MCP", "kind": "mcp", "description": "Search internal product and engineering documentation", "connection_type": "mcp"},
    {"id": "incident-mcp", "tool_id": "incident-mcp", "name": "Incident MCP", "kind": "mcp", "description": "Read incident timelines and operational events", "connection_type": "mcp"},
    {"id": "policy-kb", "tool_id": "policy-kb", "name": "Policy Knowledge Base", "kind": "kb", "description": "Company policies, permissions and compliance guidance", "connection_type": "kb"},
    {"id": "support-kb", "tool_id": "support-kb", "name": "Support Knowledge Base", "kind": "kb", "description": "Curated support answers and troubleshooting articles", "connection_type": "kb"},
)


class BuiltinTargetComponentCatalog:
    def list(self) -> list[dict[str, Any]]:
        return [dict(item) for item in COMPONENTS]

    def list_kind(self, kind: str) -> list[dict[str, Any]]:
        return [dict(item) for item in COMPONENTS if item["kind"] == kind]

    def resolve(self, component_ids: list[str] | tuple[str, ...]) -> list[dict[str, Any]]:
        indexed = {item["id"]: item for item in COMPONENTS}
        unknown = [item_id for item_id in component_ids if item_id not in indexed]
        if unknown:
            raise ApiError(400, "unknown_target_component", f"Unknown Target component: {', '.join(unknown)}")
        return [dict(indexed[item_id]) for item_id in component_ids]
