"""Real-embedder integration tests (skipped when sentence-transformers is not
installed). THE point of the explicit scope test: MiniLM rates
'S3 price us-east-1' vs 'eu-west-1' queries ~0.97 cosine — near-identical — so
serving safety MUST come from the scope hard-gate, never from the embedder."""
from __future__ import annotations

import importlib.util

import pytest

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.schemas import DepositIn
from rrsrch.store.memory import InMemoryStore

minilm_available = importlib.util.find_spec("sentence_transformers") is not None
pytestmark = pytest.mark.skipif(not minilm_available,
                                reason="sentence-transformers not installed")


def _corpus() -> Corpus:
    settings = Settings(store="memory", embedder="minilm")   # tuned default threshold
    return Corpus(InMemoryStore(), get_embedder(settings), settings)


async def test_scope_gate_holds_on_minilm_us_east_vs_eu_west():
    corpus = _corpus()
    await corpus.deposit(DepositIn(query="S3 Standard storage price per GB",
                                   claim="$0.023 per GB-month",
                                   scope={"region": "us-east-1"}, volatility_hint="high"))
    # sanity: same scope serves — the deposit is findable at the tuned threshold
    same = await corpus.search("S3 Standard storage price per GB",
                               scope={"region": "us-east-1"})
    assert same.serve is True

    # THE test: near-identical text (MiniLM cosine ≈ 0.97+), conflicting scope.
    # The hard gate must fire before similarity — a false hit here is the worst
    # failure mode the system has.
    other = await corpus.search("S3 Standard storage price per GB",
                                scope={"region": "eu-west-1"})
    assert other.serve is False


async def test_minilm_bridges_paraphrase_at_tuned_threshold():
    corpus = _corpus()
    await corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="110 NIST 800-171 controls; assessed by a C3PAO.", volatility_hint="low"))
    out = await corpus.search("what does CMMC level 2 require for assessment?")
    assert out.serve is True and out.outcome == "hit"


async def test_intent_guard_holds_on_minilm_require_vs_not_require():
    """The real threat model: on MiniLM these two embed near-identically and
    similarity clears the tuned threshold — only the intent guard stands between
    the cache and a confidently wrong answer."""
    corpus = _corpus()
    await corpus.deposit(DepositIn(query="Does CMMC Level 2 require MFA?",
                                   claim="Yes — MFA is required under IA.L2-3.5.3.",
                                   volatility_hint="low"))
    out = await corpus.search("Does CMMC Level 2 not require MFA?")
    assert out.serve is False and out.reason == "intent_mismatch"
    assert out.similarity >= corpus.settings.similarity_threshold  # guard, not luck


async def test_intent_guard_holds_on_minilm_enable_vs_disable():
    corpus = _corpus()
    await corpus.deposit(DepositIn(query="How do I enable S3 bucket versioning?",
                                   claim="PutBucketVersioning with Status=Enabled."))
    out = await corpus.search("How do I disable S3 bucket versioning?")
    assert out.serve is False and out.reason == "intent_mismatch"
    assert out.similarity >= corpus.settings.similarity_threshold
