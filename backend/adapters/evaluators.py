from __future__ import annotations

from typing import Any


class BuiltinEvaluatorCatalog:
    def list_evaluators(self) -> list[dict[str, Any]]:
        return [
            {"id": "deterministic", "name": "Deterministic evaluator", "available": True},
            {"id": "llm-judge", "name": "LLM judge", "available": True},
        ]
