"""Scope is a HARD GATE, applied BEFORE similarity — not a soft signal.

=============================================================================
THE INVIOLABLE RULE: whether two scopes conflict — declared OR inferred — is
DETERMINISTIC code. An LLM may PROPOSE implicit-scope tags from text (fuzzy,
recoverable); CODE decides conflict and gates the serve. Embedding similarity
retrieves candidates; it never overrides a scope conflict.
=============================================================================

Two layers:

DECLARED scope (Phase 0): explicit key/value dicts on deposits and queries
("region": "us-east-1"). Conflict on any shared key rejects the candidate.

IMPLICIT scope (Phase 2): scope that lives in the QUERY PROSE — the language /
technology / platform a question is about behaves exactly like region does for
pricing. "profile memory in Rust" vs "in CSS" embeds at 0.87 but is a hard
boundary. A curated gazetteer (deliberately TIGHT — every entry can veto a
serve, and a false reject only costs a fresh search) extracts normalized tags
per dimension; conflict rules:

  (a) a dimension where EACH side carries a tag the other lacks → reject.
      Disjoint sets are the obvious case (rust vs css); the symmetric-
      difference form also catches subject swaps masked by a shared
      connector: {postgres, node} vs {mysql, node} conflicts — node agrees
      but each side names a database the other doesn't.
  (b) both sides tagged at all, but the tag UNIONS are disjoint → reject
      ("Ubuntu LTS" vs "Django LTS": different dimensions, zero common subject)

No signal on a side ⇒ no gate (ambiguous ≠ conflict — the intent-guard
philosophy). Aliases normalize BEFORE comparison so "S3" == "Amazon S3",
"postgres" == "PostgreSQL", "k8s" == "kubernetes".

Deliberately EXCLUDED from the gazetteer (see DECISIONS): umbrella terms
(linux, unix, aws, cloud — hierarchical false conflicts: Ubuntu IS linux) and
bare common-word names (go, r, lambda) — Go and R are matched only via the
"in go" / "in r" context bigrams.
"""
from __future__ import annotations

import re
from typing import Any

# --------------------------------------------------------- declared (Phase 0)


def _norm(v: Any) -> Any:
    return v.strip().lower() if isinstance(v, str) else v


def conflicts(query_scope: dict[str, Any] | None, candidate_scope: dict[str, Any] | None) -> bool:
    """True if the DECLARED scopes disagree on any shared key."""
    q = query_scope or {}
    c = candidate_scope or {}
    for key in set(q) & set(c):
        if _norm(q[key]) != _norm(c[key]):
            return True
    return False


# --------------------------------------------------------- implicit (Phase 2)

DIMENSIONS = ("language", "technology", "platform")

# alias → (dimension, canonical). Multi-word aliases are matched as token
# n-grams (up to 3). Tight by design: precision over coverage.
GAZETTEER: dict[str, tuple[str, str]] = {
    # -- language --
    "python": ("language", "python"), "cpython": ("language", "python"),
    "java": ("language", "java"),
    "javascript": ("language", "javascript"), "js": ("language", "javascript"),
    "typescript": ("language", "typescript"), "ts": ("language", "typescript"),
    "rust": ("language", "rust"),
    "golang": ("language", "golang"), "in go": ("language", "golang"),
    "with go": ("language", "golang"),
    "in r": ("language", "rlang"), "with r": ("language", "rlang"),
    "ruby": ("language", "ruby"), "php": ("language", "php"),
    "swift": ("language", "swift"), "kotlin": ("language", "kotlin"),
    "scala": ("language", "scala"), "haskell": ("language", "haskell"),
    "elixir": ("language", "elixir"), "perl": ("language", "perl"),
    "bash": ("language", "bash"), "css": ("language", "css"),
    "html": ("language", "html"), "sql": ("language", "sql"),
    "c++": ("language", "cpp"), "cpp": ("language", "cpp"),
    "c#": ("language", "csharp"), "csharp": ("language", "csharp"),
    # -- technology / product --
    "docker": ("technology", "docker"),
    "kubernetes": ("technology", "kubernetes"), "k8s": ("technology", "kubernetes"),
    "postgres": ("technology", "postgres"), "postgresql": ("technology", "postgres"),
    "mysql": ("technology", "mysql"),
    "mongodb": ("technology", "mongodb"), "mongo": ("technology", "mongodb"),
    "redis": ("technology", "redis"), "kafka": ("technology", "kafka"),
    "s3": ("technology", "s3"), "amazon s3": ("technology", "s3"),
    "aws s3": ("technology", "s3"),
    "ec2": ("technology", "ec2"), "dynamodb": ("technology", "dynamodb"),
    "rds": ("technology", "rds"),
    "aws lambda": ("technology", "aws-lambda"),
    "gcs": ("technology", "gcs"), "google cloud storage": ("technology", "gcs"),
    "terraform": ("technology", "terraform"), "ansible": ("technology", "ansible"),
    "git": ("technology", "git"), "github": ("technology", "github"),
    "gitlab": ("technology", "gitlab"),
    "django": ("technology", "django"), "flask": ("technology", "flask"),
    "react": ("technology", "react"), "vue": ("technology", "vue"),
    "angular": ("technology", "angular"),
    "node": ("technology", "node"), "nodejs": ("technology", "node"),
    "node.js": ("technology", "node"),
    "excel": ("technology", "excel"),
    "numpy": ("technology", "numpy"), "pandas": ("technology", "pandas"),
    "nginx": ("technology", "nginx"), "jenkins": ("technology", "jenkins"),
    "jwt": ("technology", "jwt"), "graphql": ("technology", "graphql"),
    "sqlite": ("technology", "sqlite"),
    "elasticsearch": ("technology", "elasticsearch"),
    # -- platform / os --
    "ubuntu": ("platform", "ubuntu"), "debian": ("platform", "debian"),
    "alpine": ("platform", "alpine"), "fedora": ("platform", "fedora"),
    "centos": ("platform", "centos"), "windows": ("platform", "windows"),
    "macos": ("platform", "macos"), "mac os": ("platform", "macos"),
    "android": ("platform", "android"), "ios": ("platform", "ios"),
}

_TOKEN = re.compile(r"[a-z0-9+#.]+")


def infer(text: str) -> dict[str, set[str]]:
    """Extract implicit-scope tags from prose. Deterministic gazetteer lookup
    over token n-grams (longest n first so 'amazon s3' wins before 's3' —
    same canonical anyway, sets dedupe). An LLM MAY implement a richer
    proposer later; it would feed the same dict and the same conflict code."""
    tokens = [t.rstrip(".") for t in _TOKEN.findall((text or "").lower())]
    tags: dict[str, set[str]] = {}
    for n in (3, 2, 1):
        for i in range(len(tokens) - n + 1):
            gram = " ".join(tokens[i:i + n])
            if gram in GAZETTEER:
                dim, canonical = GAZETTEER[gram]
                tags.setdefault(dim, set()).add(canonical)
    return tags


def effective_tags(text: str, declared: dict[str, Any] | None) -> dict[str, set[str]]:
    """Inferred tags, with DECLARED values authoritative on their dimension."""
    tags = infer(text)
    for dim in DIMENSIONS:
        if declared and dim in declared:
            tags[dim] = {str(_norm(declared[dim]))}
    return tags


def implicit_conflicts(q: dict[str, set[str]], c: dict[str, set[str]]) -> bool:
    """True when the implicit scopes CONFLICT. Gate only on disagreement between
    two present signals — one-sided or absent signals never gate (a side that
    merely names EXTRA subjects the other omits is richer wording, not a
    conflict; both sides naming something the other lacks is a subject swap)."""
    for dim in set(q) & set(c):
        if (q[dim] - c[dim]) and (c[dim] - q[dim]):
            return True                                   # rule (a), symmetric
    q_all = set().union(*q.values()) if q else set()
    c_all = set().union(*c.values()) if c else set()
    return bool(q_all) and bool(c_all) and not (q_all & c_all)   # rule (b)
