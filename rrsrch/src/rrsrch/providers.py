"""Real SearchProviders — live research capability behind the existing interface.

=============================================================================
THE INVIOLABLE RULE: a provider derives EVIDENCE (search + fetch + distill —
an LLM MAY do the distilling; that is the fuzzy, recoverable part). It NEVER
decides trust: whatever it returns goes through corroborate()'s deterministic
verdict. Nothing in this module scores confidence or renders agreement.
=============================================================================

Tests always use the fake provider (tests/conftest.py). These run only in
explicit, env-gated paths (`make verify-live`); never in CI-by-default.
"""
from __future__ import annotations

import asyncio
import json
import re
import shutil
from typing import Any

from .config import Settings
from .schemas import ResearchResult, Source

_PROMPT = """Research this question using web search and answer from what you find.

Question: {query}
{scope_line}
Respond with ONLY a JSON object, no prose, no code fences:
{{"claim": "<one compact, self-contained factual answer>",
  "sources": [{{"url": "<url>", "title": "<title>"}}, ...]}}

The claim must state the concrete fact (include numbers/versions/dates), not a summary
of the search process. 1-3 sources, the most authoritative you found."""


class WebSearchProvider:
    """Search + fetch + distill via the Claude Code CLI in headless mode
    (`claude -p` with WebSearch/WebFetch allowed). Uses the machine's existing
    CLI auth — no separate API key. Fails loudly at construction if the binary
    is missing (RRSRCH_CLAUDE_BIN to point elsewhere)."""

    def __init__(self, settings: Settings) -> None:
        found = shutil.which(settings.claude_bin)
        if found is None:
            raise RuntimeError(
                f"WebSearchProvider unconfigured: {settings.claude_bin!r} not found on "
                "PATH. Install/authenticate the Claude Code CLI or set RRSRCH_CLAUDE_BIN. "
                "(Refusing to no-op silently — a fake verification is worse than none.)")
        self._bin: str = found
        self._model = settings.provider_model
        self._timeout = settings.provider_timeout_seconds

    async def research(self, query: str, scope: dict[str, Any] | None) -> ResearchResult:
        scope_line = f"Constraints (scope): {json.dumps(scope)}\n" if scope else ""
        prompt = _PROMPT.format(query=query, scope_line=scope_line)
        argv = [self._bin, "-p", prompt, "--output-format", "json",
                "--allowedTools", "WebSearch,WebFetch"]
        if self._model:
            argv += ["--model", self._model]
        proc = await asyncio.create_subprocess_exec(
            *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=self._timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"live research timed out after {self._timeout}s: {query!r}")
        if proc.returncode != 0:
            raise RuntimeError(f"claude CLI failed ({proc.returncode}): {err.decode()[:500]}")

        wrapper = json.loads(out.decode())
        payload = _extract_json(wrapper.get("result", ""))
        usage = wrapper.get("usage", {}) or {}
        tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        return ResearchResult(
            claim=str(payload["claim"]),
            sources=[Source(url=s["url"], title=s.get("title"))
                     for s in payload.get("sources", []) if s.get("url")],
            tokens_spent=tokens or 1,   # never report a free derivation
        )


def _extract_json(text: str) -> dict[str, Any]:
    """The model was told 'JSON only' but belt-and-suspenders: find the object."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"provider returned no JSON object: {text[:300]!r}")
    return json.loads(m.group(0))


def build_provider(settings: Settings) -> WebSearchProvider:
    if settings.provider == "claude-cli":
        return WebSearchProvider(settings)
    raise RuntimeError(
        f"no live provider configured (RRSRCH_PROVIDER={settings.provider!r}). "
        "Set RRSRCH_PROVIDER=claude-cli to enable live verification.")
