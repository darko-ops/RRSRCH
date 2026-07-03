"""Lexical similarity — the keyword/typo half of hybrid retrieval. Deterministic,
no model. Char-trigram Jaccard (matches paraphrases sharing words, and typos)
blended with token Jaccard. In Postgres this role is played by FTS/trigram; the
offline store uses this pure-Python version so the engine is store-agnostic."""
from __future__ import annotations

import re


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _trigrams(s: str) -> set[str]:
    s = f"  {_norm(s)} "
    return {s[i : i + 3] for i in range(len(s) - 2)} if len(s) >= 3 else {s}


def _tokens(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", _norm(s)))


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def lexical_score(a: str, b: str) -> float:
    """Blended lexical similarity in [0, 1]."""
    tri = _jaccard(_trigrams(a), _trigrams(b))
    tok = _jaccard(_tokens(a), _tokens(b))
    return 0.5 * tri + 0.5 * tok
