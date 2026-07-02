"""Synthetic-but-honest traffic generation. MATCHER-BLIND: imports nothing from
rrsrch (pinned by test). Popularity is Zipfian over intents (exponent s is a
STATED ASSUMPTION, swept in the report, never tuned to a result); variant
selection is a uniform draw from a seeded RNG — never similarity-based.
"""
from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Any

from eval.intents import INTENTS, Intent, label_scope_key, one_off


@dataclass(frozen=True)
class Label:
    """Ground truth the engine never sees."""
    intent_id: str
    scope_key: str
    polarity: str          # 'aff' | 'neg' (negation/antonym direction)


@dataclass(frozen=True)
class Query:
    text: str
    scope: dict[str, Any] | None
    label: Label
    kind: str              # paraphrase | canonical | flip | scope_variant | one_off
    gap_minutes: float     # simulated time since the previous arrival
    volatility: str
    intent: Intent | None  # None for one-offs (truth resolved via one_off_answer)
    one_off_answer: str | None = None


def zipf_weights(n: int, s: float) -> list[float]:
    return [1.0 / (rank + 1) ** s for rank in range(n)]


def generate_stream(n: int, *, s: float, seed: int,
                    one_off_rate: float = 0.15,
                    flip_rate: float = 0.07,
                    scope_variant_rate: float = 0.07) -> list[Query]:
    """The arrival stream. All randomness flows from `seed` — a run is exactly
    reproducible, and nothing here ever consults an embedding score."""
    rng = Random(seed)
    weights = zipf_weights(len(INTENTS), s)
    stream: list[Query] = []
    one_offs = 0
    for _ in range(n):
        gap = rng.uniform(5.0, 45.0)   # minutes between arrivals
        if rng.random() < one_off_rate:
            text, answer = one_off(one_offs)
            one_offs += 1
            stream.append(Query(text, None,
                                Label(f"oneoff-{one_offs}", "", "aff"),
                                "one_off", gap, "medium", None, answer))
            continue

        intent = rng.choices(INTENTS, weights=weights, k=1)[0]
        roll = rng.random()
        if intent.flip is not None and roll < flip_rate:
            stream.append(Query(intent.flip, intent.scope,
                                Label(intent.intent_id, intent.scope_key(), "neg"),
                                "flip", gap, intent.volatility, intent))
        elif intent.alt_scope is not None and roll < flip_rate + scope_variant_rate:
            text = rng.choice((intent.canonical, *intent.paraphrases))
            stream.append(Query(text, intent.alt_scope,
                                Label(intent.intent_id,
                                      label_scope_key(intent.alt_scope), "aff"),
                                "scope_variant", gap, intent.volatility, intent))
        else:
            text = rng.choice((intent.canonical, *intent.paraphrases))
            kind = "canonical" if text == intent.canonical else "paraphrase"
            stream.append(Query(text, intent.scope,
                                Label(intent.intent_id, intent.scope_key(), "aff"),
                                kind, gap, intent.volatility, intent))
    return stream


def current_truth(q: Query, progress: float, change_at: float = 0.5) -> str:
    """Ground-truth answer for this query at this point in the stream. Volatile
    intents with an answer_v2 change truth at `change_at` — the harness's world
    moves under the corpus, exactly like production."""
    if q.one_off_answer is not None:
        return q.one_off_answer
    assert q.intent is not None
    it = q.intent
    if q.label.polarity == "neg":
        return it.flip_answer or ""
    if q.kind == "scope_variant":
        return it.alt_scope_answer or ""
    if it.answer_v2 is not None and progress >= change_at:
        return it.answer_v2
    return it.answer
