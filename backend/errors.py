from __future__ import annotations

from typing import Any


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def not_found(resource_id: str) -> ApiError:
    return ApiError(
        404,
        "not_found",
        f"Resource '{resource_id}' was not found",
        {"resource_id": resource_id},
    )
