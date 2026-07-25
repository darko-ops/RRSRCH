"""/recent + /dashboard: the read-only observability surface. Asserts the feed
mirrors the event log (hits enriched from the deposit they served), the corpus
counts are real, and the page is self-contained — no external network deps."""
from __future__ import annotations

from datetime import timedelta

import httpx

from rrsrch.api import create_app
from rrsrch.schemas import DepositIn, Source

Q = "CMMC Level 2 assessment requirements"
CLAIM = ("CMMC Level 2 requires implementing the 110 security controls of NIST SP "
         "800-171 and, for most contractors, a triennial third-party assessment.")
SRC = "https://dodcio.defense.gov/cmmc/"


async def test_recent_feed_enriches_hits_and_keeps_misses_bare(make_corpus):
    corpus, clk = make_corpus()
    await corpus.search(Q)                                     # miss (empty corpus)
    await corpus.deposit(DepositIn(query=Q, claim=CLAIM, volatility_hint="low",
                                   sources=[Source(url=SRC)], depositor="agent-a"))
    clk.t = clk.t + timedelta(days=3)
    out = await corpus.search("what does CMMC level 2 require for assessment?")
    assert out.outcome == "hit"

    feed = await corpus.recent()
    assert [e["outcome"] for e in feed] == ["hit", "miss"]     # newest first
    hit, miss = feed
    # the trust view: claim + provenance + freshness ride the hit row
    assert hit["claim"].startswith("CMMC Level 2 requires")
    assert hit["source_urls"] == [SRC]
    assert hit["depositor"] == "agent-a"
    assert hit["age_seconds"] == 3 * 86400                     # controllable clock
    assert hit["confidence"] is not None and hit["similarity"] is not None
    # a miss served nothing, so nothing to attribute
    assert "claim" not in miss and miss["served_deposit_id"] is None


async def test_recent_truncates_long_claims_and_honors_limit(make_corpus):
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(query=Q, claim="x" * 500, volatility_hint="low",
                                   sources=[Source(url=SRC)]))
    clk.t = clk.t + timedelta(days=1)
    out = await corpus.search(Q)
    assert out.outcome == "hit"
    feed = await corpus.recent(limit=1)
    assert len(feed) == 1
    assert feed[0]["claim"].endswith("…") and len(feed[0]["claim"]) == 241


async def test_corpus_stats_counts_live_deposits(make_corpus):
    corpus, _ = make_corpus()
    assert await corpus.store.corpus_stats() == {
        "live_deposits": 0, "distinct_questions": 0, "total_deposits": 0}
    rec = await corpus.deposit(DepositIn(query=Q, claim=CLAIM, volatility_hint="low"))
    await corpus.corroborate(str(rec.id), "CMMC Level 2 now requires 134 controls.",
                             depositor="rrsrch-verify")        # disagree → retire+replace
    stats = await corpus.store.corpus_stats()
    assert stats == {"live_deposits": 1, "distinct_questions": 1, "total_deposits": 2}
    m = await corpus.metrics()
    assert m["corpus"] == stats                                # tiles read real counts


async def test_api_recent_and_dashboard(make_corpus):
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(query=Q, claim=CLAIM, volatility_hint="low",
                                   sources=[Source(url=SRC)], depositor="agent-a"))
    clk.t = clk.t + timedelta(days=1)
    assert (await corpus.search(Q)).outcome == "hit"

    app = create_app(corpus)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        r = await client.get("/recent")
        assert r.status_code == 200
        rows = r.json()
        assert rows[0]["outcome"] == "hit" and rows[0]["depositor"] == "agent-a"
        assert rows[0]["source_urls"] == [SRC] and rows[0]["confidence"] is not None

        page = await client.get("/dashboard")
        assert page.status_code == 200
        assert page.headers["content-type"].startswith("text/html")
        html = page.text
        for section in ("Reuse feed", "Knowledge stored", "Corrections",
                        "estimate", "/recent?limit=30"):
            assert section in html
        # self-contained: no external scripts/styles/fonts/images
        for external in ('src="http', "src='http", 'href="http', "@import",
                         "url(http", "cdn."):
            assert external not in html
