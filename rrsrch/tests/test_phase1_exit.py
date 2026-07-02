"""Phase 1 exit criteria — the acceptance harness. If these pass, Phase 1's thesis
holds: the corpus verifies itself, steers its verification budget toward
uncertainty, and the corroboration gate is safe against negation and paraphrase.

(Exit criterion 4 — "everything Phase 0 proved still passes" — is the rest of
this test suite plus ruff/mypy; nothing here mocks or bypasses Phase 0 paths.)

Run with `pytest -s tests/test_phase1_exit.py` to see the budget-flow curves.
"""
from __future__ import annotations

from datetime import timedelta

from rrsrch.schemas import DepositIn
from rrsrch.verification import Verifier
from tests.conftest import FakeProvider

PRICE_Q = "current S3 Standard storage price per GB"


# ---------------------------------------------------------------- criterion 1

async def test_exit_1_automatic_correction_no_agent_no_human(make_corpus):
    """Seed a high-volatility deposit, let it stale, and let the SELF-verification
    loop catch and correct it. No agent calls corroborate; no human touches it."""
    provider = FakeProvider(answer="$0.021 per GB-month (reduced January 2026)")
    corpus, clk = make_corpus(provider=provider)
    t0 = clk.t
    old = await corpus.deposit(DepositIn(query=PRICE_Q, claim="$0.023 per GB-month",
                                         volatility_hint="high",
                                         scope={"region": "us-east-1"}))
    clk.t += timedelta(days=60)   # long stale by now

    # sanity: it IS stale — an agent asking would be told to re-derive
    assert (await corpus.search(PRICE_Q, scope={"region": "us-east-1"})).outcome == "stale"

    # the verifier — not an agent — runs
    reports = await Verifier(corpus, provider).verify_once()
    assert any(r.outcome == "disagreed" for r in reports)

    # old retired, superseded; the correction came from the verifier itself
    retired = await corpus.store.get(old.id)
    assert retired.retired_at is not None and retired.superseded_by is not None
    fresh = await corpus.store.get(retired.superseded_by)
    assert fresh.depositor == "rrsrch-verifier"

    # the new answer is served thereafter
    served = await corpus.search(PRICE_Q, scope={"region": "us-east-1"})
    assert served.serve is True and "$0.021" in served.claim

    # ...and the change shows up in the recall feed + direct lookup
    feed = await corpus.recalls(t0)
    assert [r for r in feed if r.retired_deposit_id == str(old.id)
            and r.superseded_by == str(fresh.id)]
    look = await corpus.lookup(str(old.id))
    assert look["retired"] is True and look["replacement"]["deposit_id"] == str(fresh.id)

    # time-to-correction is measured, not asserted into existence
    m = await corpus.metrics()
    assert m["mean_time_to_correction_seconds"] is not None
    assert m["mean_time_to_correction_seconds"] > 0


# ---------------------------------------------------------------- criterion 2

async def test_exit_2_budget_steers_to_the_volatile_topic(make_corpus):
    """One settled topic (always agrees) vs one volatile topic (always disagrees):
    exploration rates must DIVERGE (floor vs ceiling) and verification spend must
    concentrate on the volatile topic. Prints both curves."""
    settled_q = "How do I rotate AWS IAM access keys?"
    settled_claim = "Create a second key, cut over, disable the old key, then delete it."
    volatile_q = "current DDR5-6000 32GB spot price"

    def fresh_answer(query: str, call_index: int) -> str:
        # step > numeric tolerance at every price level, so each fresh derivation
        # genuinely disagrees with the previous one
        return f"${88 + 10 * call_index} per kit as of this week"

    provider = FakeProvider(answer=fresh_answer, answers={settled_q: settled_claim})
    corpus, clk = make_corpus(
        provider=provider,
        # sharper bandit for a compact simulation — same bounded rules, tuned knobs
        exploration_decay_factor=0.5, exploration_growth_factor=2.0)
    s = corpus.settings

    await corpus.deposit(DepositIn(query=settled_q, claim=settled_claim,
                                   volatility_hint="medium"))
    # the depositor GUESSED low — the topic's own behavior must override that
    vol_rec = await corpus.deposit(DepositIn(query=volatile_q, claim="$87 per kit",
                                             volatility_hint="low"))
    settled_rec = await corpus.store.latest_live_deposit(
        (await corpus.deposit(DepositIn(query=settled_q, claim=settled_claim))).topic_id)
    settled_tid = settled_rec.topic_id
    volatile_tid = vol_rec.topic_id
    assert settled_tid != volatile_tid

    verifier = Verifier(corpus, provider)
    curve_settled: list[float] = []
    curve_volatile: list[float] = []
    for _round in range(60):
        clk.t += timedelta(days=1)
        await verifier.verify_once(batch_size=1)   # one verification budget unit/day
        curve_settled.append((await corpus.store.get_topic(settled_tid)).exploration_rate)
        curve_volatile.append((await corpus.store.get_topic(volatile_tid)).exploration_rate)

    print("\nexploration_rate curves (60 simulated days, 1 verification/day):")
    print("  day      : " + " ".join(f"{d:>5}" for d in range(0, 60, 6)))
    print("  settled  : " + " ".join(f"{curve_settled[d]:>5.3f}" for d in range(0, 60, 6)))
    print("  volatile : " + " ".join(f"{curve_volatile[d]:>5.3f}" for d in range(0, 60, 6)))

    # DIVERGENCE: settled pinned to the floor, volatile pinned to the ceiling
    assert curve_settled[-1] == s.exploration_floor
    assert curve_volatile[-1] == s.exploration_ceiling

    # BUDGET FLOW: spend concentrated on the volatile topic, drained from settled
    m = await corpus.metrics()
    spend_settled = m["topics"][settled_tid]["explore_tokens"]
    spend_volatile = m["topics"][volatile_tid]["explore_tokens"]
    print(f"  verification spend: volatile={spend_volatile:,} tok, "
          f"settled={spend_settled:,} tok "
          f"({spend_volatile / max(spend_settled, 1):.0f}x concentration)")
    assert spend_volatile > 5 * spend_settled

    # OBSERVED VOLATILITY: the 'low' hint was overridden by the evidence
    vt = await corpus.store.get_topic(volatile_tid)
    assert vt.base_volatility == "low" and vt.observed_volatility == "high"
    assert vt.half_life_factor == s.half_life_factor_min   # decay sped up too


# ---------------------------------------------------------------- criterion 3

async def test_exit_3_negation_disagrees_paraphrase_agrees(make_corpus):
    """The two cases Phase 0's lexical gate got wrong, now through corroborate()."""
    corpus, _ = make_corpus()

    # negation: lexically near-identical, semantically opposite → MUST disagree
    a = await corpus.deposit(DepositIn(query="Is Acme Corp SOC 2 compliant?",
                                       claim="Acme Corp is compliant with SOC 2 Type II"))
    neg = await corpus.corroborate(str(a.id),
                                   "Acme Corp is not compliant with SOC 2 Type II")
    assert neg.outcome == "disagreed" and neg.rule == "polarity_mismatch"
    assert neg.claim_similarity > 0.7   # Phase 0's gate would have called this agreed

    # paraphrase: lexically distant, semantically identical → MUST agree
    b = await corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="CMMC Level 2 requires the 110 NIST 800-171 controls, assessed by a C3PAO"))
    para = await corpus.corroborate(
        str(b.id), "A C3PAO assesses the 110 controls of NIST 800-171 for CMMC Level 2")
    assert para.outcome == "agreed" and para.rule == "numeric_match"
    assert para.claim_similarity < 0.9  # Phase 0's gate would have called this disagreed


# ------------------------------------------------- bonus: bandit round trip

async def test_bandit_round_trip_rate_recovers_when_topic_restabilizes(make_corpus):
    """settled → volatile → settled again: exploration_rate must come back DOWN
    to the floor once the topic re-stabilizes — not stay pinned at the ceiling."""
    provider = FakeProvider(answer="unused")
    corpus, clk = make_corpus(provider=provider,
                              exploration_decay_factor=0.5,
                              exploration_growth_factor=2.0)
    s = corpus.settings
    rec = await corpus.deposit(DepositIn(query="current stable Kubernetes minor version",
                                         claim="v1 minor 33", volatility_hint="medium"))
    tid = rec.topic_id
    verifier = Verifier(corpus, provider)

    async def run_phase(days: int, answers) -> list[float]:
        rates = []
        for i in range(days):
            clk.t += timedelta(days=1)
            provider.answer = answers(i)
            await verifier.verify_once(batch_size=1)
            rates.append((await corpus.store.get_topic(tid)).exploration_rate)
        return rates

    # volatile phase: the answer keeps changing → rate climbs to the ceiling
    up = await run_phase(8, lambda i: f"v1 minor {40 + 10 * i}")
    assert up[-1] == s.exploration_ceiling

    # re-stabilized phase: the answer stops changing → agreements walk it back down
    latest = await corpus.store.latest_live_deposit(tid)
    down = await run_phase(20, lambda i: latest.claim)
    assert down[-1] == s.exploration_floor       # NOT stuck at the ceiling
    assert min(down) < up[-1]                    # monotone recovery happened
