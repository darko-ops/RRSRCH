"""The flywheel harness itself needs proving: traffic is matcher-blind and
reproducible, labels classify correctly, and the runner drives the real engine
end-to-end (offline smoke: memory store + hash embedder)."""
from __future__ import annotations

import inspect

from rrsrch.config import Settings

import eval.intents as intents_mod
import eval.traffic as traffic_mod
from eval.flywheel import RegEntry, _classify_serve, run_stream, summarize
from eval.intents import INTENTS
from eval.traffic import Label, generate_stream

# ------------------------------------------------ matcher-blindness (exit 3)


def test_traffic_generation_is_matcher_blind():
    """The dataset and generator must be provably independent of the embedding
    model: no rrsrch/model imports, no embedding or similarity machinery invoked,
    variant selection driven only by a seeded Random. (AST-based — the modules'
    docstrings legitimately DISCUSS the blindness property.)"""
    import ast

    for mod in (intents_mod, traffic_mod):
        tree = ast.parse(inspect.getsource(mod))
        imports = [a.name for n in ast.walk(tree) if isinstance(n, ast.Import)
                   for a in n.names]
        imports += [n.module or "" for n in ast.walk(tree)
                    if isinstance(n, ast.ImportFrom)]
        for name in imports:
            assert not name.startswith(("rrsrch", "sentence_transformers",
                                        "torch", "numpy")), \
                f"{mod.__name__} imports {name!r} — not matcher-blind"
        called = {n.func.attr for n in ast.walk(tree)
                  if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
        assert not called & {"encode", "cosine", "similarity", "rank"}, \
            f"{mod.__name__} calls matcher machinery: {called}"


def test_stream_is_reproducible_and_seed_sensitive():
    a = generate_stream(200, s=1.0, seed=7)
    b = generate_stream(200, s=1.0, seed=7)
    c = generate_stream(200, s=1.0, seed=8)
    assert [q.text for q in a] == [q.text for q in b]
    assert [q.text for q in a] != [q.text for q in c]


def test_zipf_exponent_shapes_popularity():
    def top_share(s: float) -> float:
        stream = generate_stream(600, s=s, seed=3, one_off_rate=0.0)
        top = INTENTS[0].intent_id
        return sum(1 for q in stream if q.label.intent_id == top) / len(stream)
    assert top_share(1.2) > top_share(0.8)   # heavier tail exponent → more head


def test_stream_has_all_variant_kinds_and_labels():
    stream = generate_stream(600, s=1.0, seed=1)
    kinds = {q.kind for q in stream}
    assert {"paraphrase", "flip", "scope_variant", "one_off"} <= kinds
    flip = next(q for q in stream if q.kind == "flip")
    assert flip.label.polarity == "neg"
    sv = next(q for q in stream if q.kind == "scope_variant")
    base = sv.intent.scope_key()
    assert sv.label.scope_key != base   # labeled with the ALT scope
    ones = [q.label.intent_id for q in stream if q.kind == "one_off"]
    assert len(ones) == len(set(ones))  # one-offs never repeat


# ------------------------------------------------------- classification


def test_classify_serve_labels():
    lab = Label("s3-price", '{"region":"us-east-1"}', "aff")
    assert _classify_serve(RegEntry(lab, "truth"), lab, "truth") == ("true_hit", None)
    assert _classify_serve(RegEntry(lab, "old"), lab, "truth") == ("outdated_serve", None)
    other_scope = Label("s3-price", '{"region":"eu-west-1"}', "aff")
    assert _classify_serve(RegEntry(other_scope, "x"), lab, "truth") == ("false_hit", "scope")
    neg = Label("s3-price", '{"region":"us-east-1"}', "neg")
    assert _classify_serve(RegEntry(neg, "x"), lab, "truth") == ("false_hit", "polarity")
    alien = Label("gil", "", "aff")
    assert _classify_serve(RegEntry(alien, "x"), lab, "truth") == ("false_hit", "wrong_intent")


# ------------------------------------------------------ end-to-end smoke


async def test_smoke_run_on_real_engine_offline():
    """Small honest run on the unmodified engine (memory store + hash embedder).
    Asserts structure and flywheel direction — NOT zero false hits; if the run
    finds them, summarize() must report them."""
    settings = Settings(store="memory", embedder="hash", similarity_threshold=0.55,
                        topic_similarity_threshold=0.50)
    stream = generate_stream(160, s=1.0, seed=11)
    result = await run_stream(stream, settings)
    s = summarize(result)

    assert s["queries"] == 160
    total = (s["true_hits"] + s["false_hits"] + s["outdated_serves"]
             + s["lost_hits"] + s["correct_misses"])
    assert total == 160                       # every query classified exactly once
    assert s["true_hits"] > 0                 # the flywheel turned at all
    assert s["precision"] is not None and s["recall"] is not None
    assert sum(s["false_hit_breakdown"].values()) == s["false_hits"]  # no suppression

    # flywheel direction: later-half true-hit rate beats the cold first half
    half = len(result.records) // 2
    early = sum(1 for r in result.records[:half] if r.classification == "true_hit")
    late = sum(1 for r in result.records[half:] if r.classification == "true_hit")
    assert late > early
