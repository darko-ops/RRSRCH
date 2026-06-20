"""OPTIONAL LLM helper: compress raw sources into a compact claim. OFF by default.

INVIOLABLE RULE: a distiller may only shape text. It MUST NEVER compute confidence,
decide a match, or influence the serve-vs-miss decision. It is pluggable and the
default is a no-op passthrough, so the system runs with zero LLM calls."""
from __future__ import annotations

from typing import Protocol


class Distiller(Protocol):
    def distill(self, query: str, sources_text: str) -> str: ...


class NoopDistiller:
    """Default: returns the input unchanged. No network, no LLM."""

    def distill(self, query: str, sources_text: str) -> str:
        return sources_text


def get_distiller(settings: object | None = None) -> Distiller:
    # Phase 0: always the no-op. A real LLM distiller can be slotted in here later,
    # behind config, without touching the trust path.
    return NoopDistiller()
