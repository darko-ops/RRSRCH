"""The serve-path intent guard: same-scope opposite-intent queries must never be
served the cached claim, and legitimate rewordings must never be blocked. One
shared Extractor with corroboration — these tests exercise the same instance
corpus.corroborate uses."""
from __future__ import annotations

from rrsrch.agreement import RegexExtractor, intent_verdict
from rrsrch.schemas import DepositIn

EX = RegexExtractor()


def iv(a: str, b: str):
    return intent_verdict(EX.extract(a), EX.extract(b))


# --- the pure verdict ---

def test_polarity_flip_rejects():
    v = iv("Does CMMC Level 2 not require MFA?", "Does CMMC Level 2 require MFA?")
    assert v.match is False and v.rule == "polarity_flip"


def test_predicate_flips_reject_across_axes():
    cases = [
        ("How do I disable S3 versioning?", "How do I enable S3 versioning?", "activation"),
        ("How to uninstall Docker", "How to install Docker", "installation"),
        ("How do I decrease EC2 memory?", "How do I increase EC2 memory?", "direction"),
        ("How to deny traffic on port 443", "How to allow traffic on port 443", "permission"),
        ("Should node_modules be excluded?", "Should node_modules be included?", "inclusion"),
        ("run migrations after deploying", "run migrations before deploying", "order"),
        ("Does CMMC prohibit shared accounts?", "Does CMMC require shared accounts?",
         "obligation"),
    ]
    for a, b, axis in cases:
        v = iv(a, b)
        assert v.match is False and v.rule == f"predicate_flip:{axis}", (a, b, v.rule)


def test_same_direction_and_synonyms_pass():
    assert iv("How do I raise EC2 memory?", "How do I increase EC2 memory?").match is True
    assert iv("How to permit traffic on 443", "How to allow traffic on 443").match is True
    assert iv("Removing the AWS CLI", "How to uninstall the AWS CLI").match is True


def test_ambiguity_is_not_mismatch():
    # no signal on either side → similarity decides (don't block)
    assert iv("What are CMMC Level 2's requirements?",
              "What does CMMC Level 2 require?").match is True   # 'requirements' ≠ signal
    assert iv("GDPR for US companies?", "Does GDPR apply to US companies?").match is True
    # signal on ONE side only → no shared axis → don't block
    assert iv("How do I exit a virtualenv?", "How do I deactivate a virtualenv?").match is True
    # BOTH poles in one text → axis dropped as ambiguous → don't block
    assert iv("how to enable or disable S3 versioning",
              "How do I enable S3 versioning?").match is True


def test_suffix_stripping_still_flips():
    assert iv("enabling S3 versioning", "disabling S3 versioning").match is False
    assert iv("increased shared_buffers", "reducing shared_buffers").match is False


# --- the guard wired into corpus.search ---

async def test_flip_query_is_a_miss_not_a_false_hit(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="Does CMMC Level 2 require MFA?",
                                   claim="Yes — MFA is required.", volatility_hint="low"))
    out = await corpus.search("Does CMMC Level 2 not require MFA?")
    assert out.serve is False and out.reason == "intent_mismatch"
    # even though similarity was ABOVE the serve threshold
    assert out.similarity is not None
    assert out.similarity >= corpus.settings.similarity_threshold


async def test_enable_disable_is_a_miss(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="How do I enable S3 bucket versioning?",
                                   claim="PutBucketVersioning Status=Enabled."))
    out = await corpus.search("How do I disable S3 bucket versioning?")
    assert out.serve is False and out.reason == "intent_mismatch"


async def test_guard_walks_to_the_right_candidate(make_corpus):
    """When BOTH directions are deposited, the flipped candidate is skipped and
    the correct-direction one is served — a rejection is not a dead end."""
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="How do I enable S3 bucket versioning?",
                                   claim="Status=Enabled."))
    rec = await corpus.deposit(DepositIn(query="How do I disable S3 bucket versioning?",
                                         claim="Status=Suspended."))
    out = await corpus.search("How do I disable S3 bucket versioning?")
    assert out.serve is True and out.deposit_id == str(rec.id)
    assert "Suspended" in out.claim


async def test_paraphrase_still_serves_through_the_guard(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="What does CMMC Level 2 require?",
                                   claim="The 110 NIST 800-171 controls."))
    out = await corpus.search("What are CMMC Level 2's requirements?")
    assert out.serve is True and out.outcome == "hit"


async def test_rejections_show_in_telemetry(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="Does CMMC Level 2 require MFA?", claim="Yes."))
    await corpus.search("Does CMMC Level 2 not require MFA?")
    m = await corpus.metrics()
    assert m["no_serve_breakdown"].get("intent_mismatch") == 1
    # ...and the raw event carries the audit detail (who was rejected, why).
    # Raw-event access is store-specific; on the in-memory store inspect directly.
    if hasattr(corpus.store, "_events"):
        ev = next(e for e in corpus.store._events if e["reason"] == "intent_mismatch")
        rej = ev["detail"]["intent_rejected"]
        assert rej and rej[0]["rule"] == "polarity_flip"


async def test_corroboration_gate_shares_the_extractor(make_corpus):
    """One extractor: the same instance serves matching AND corroboration, and
    corroboration behavior is unchanged by the predicates field."""
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current S3 price per GB",
                                         claim="$0.023 per GB-month"))
    assert corpus.extractor.extract("enable X").predicates == {"activation": 1}
    out = await corpus.corroborate(str(rec.id), "$0.023 per GB-month")
    assert out.outcome == "agreed" and out.rule == "numeric_match"  # unchanged