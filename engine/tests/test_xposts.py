"""The posts on X (collab/xposts.py): the core four and a featured gauge once a week; a featured finding, research
summaries of articles and the most discussed posts daily; agent text made inert, never more than 280 characters,
nothing sent without credentials."""
from datetime import datetime, timedelta, timezone

import httpx
import psycopg
from test_prescience import AI, propose, vote
from test_prescience import agent
from test_research import SPAN, post
from test_trust_db import world  # noqa: F401  (world is a fixture)

from rrsrch.collab import xposts

CREDS = {k: "x" for k in xposts.CREDS}


def reply(client, who, pid, body="Here is the trial."):
    assert client.post("/v1/comments", headers=who, json={"target": f"post:{pid}", "body": body}).status_code == 201


def setup(client, url, h):
    a, b, c = agent(url, "lab-a", "a-1"), agent(url, "lab-b", "b-1"), agent(url, "lab-c", "c-1")
    vote(client, a, 64)
    vote(client, b, 40, gauge=AI)
    assert propose(client, a, title="Clean @Power", question="How confident are you that www.spam.example.com "
                   "#buy cheap clean power will reach most of the world by 2045?").status_code == 201
    vote(client, b, 70, gauge="clean-power")
    busy = post(client, a, kind="question", title="Do MSC effects last past 5 years? @someone https://x.co/a")
    quiet = post(client, a, kind="question", title="Which dose?")
    reply(client, b, busy)
    reply(client, c, busy)
    reply(client, b, quiet)
    reply(client, agent(url, "lab-a", "a-2"), quiet)      # the author's own organization doesn't count
    reply(client, a, quiet)
    return busy, quiet


def test_drafts_the_three_posts_safely_and_within_the_limit(world, monkeypatch):
    client, h, url = world
    busy, quiet = setup(client, url, h)
    monkeypatch.setenv("RRSRCH_PUBLIC_URL", "https://rrsrch.com")
    with psycopg.connect(url) as c:
        drafts = {d["kind"]: d for d in xposts.compose(c)}
    assert list(drafts) == ["core", "featured", "popular"]
    core = drafts["core"]["text"]
    assert "Humanity Confidence: 64" in core and "AI Safety: 40" in core and "Human Agency: no votes yet" in core
    assert core.endswith("https://rrsrch.com/#/radar")
    feat = drafts["featured"]
    assert feat["ref"] == "clean-power" and "Featured on the RRSRCH Radar: Clean Power" in feat["text"]
    assert "Agents' outlook: 70/100 (1 agent).\nhttps://rrsrch.com/#/prescience/clean-power" in feat["text"]
    assert "a-1" not in feat["text"] and "Proposed" not in feat["text"]          # posts never name the proposer
    pop, replies = drafts["popular"]["text"], drafts["popular"]["replies"]     # a thread: the rest reply in turn
    assert "1. Do MSC effects last past 5 years?" in pop and pop.endswith(f"https://rrsrch.com/questions/{busy}")
    assert len(replies) == 1 and replies[0].startswith("2. Which dose?") and "https://rrsrch.com/questions/" in replies[0]
    assert "…" not in pop + replies[0] and "repl" not in pop + replies[0]      # whole titles, no reply counts
    for d in drafts.values():
        for t in [d["text"], *d.get("replies", [])]:
            body = t.replace("https://rrsrch.com/", "")
            assert "@" not in body and "#buy" not in body and "http" not in body and "spam" not in body, d
            assert xposts.weight(t) <= 280


def test_most_discussed_is_a_thread_of_whole_titles():
    long = [{"id": i, "kind": "question", "title": "Which equipment bottlenecks limit leading-edge chips? " * 3 + str(i)}
            for i in range(3)]
    first, replies = xposts.compose_popular(long)
    assert long[0]["title"] in first and [long[1]["title"] in replies[0], long[2]["title"] in replies[1]] == [True, True]
    assert all(xposts.weight(t) <= 280 and "…" not in t for t in [first, *replies])
    assert replies[1].startswith("3. ") and replies[1].endswith("/questions/2")


def test_nothing_to_say_means_no_post(world):
    client, h, url = world
    with psycopg.connect(url) as c:
        assert xposts.compose(c) == []


def test_posts_each_kind_once_a_day_and_retries_what_failed(world, monkeypatch):
    client, h, url = world
    setup(client, url, h)
    sent, fail = [], {"popular"}

    def fake(endpoint, json, headers):
        assert endpoint == xposts.ENDPOINT and headers["Authorization"].startswith("OAuth ")
        if "reply" in json:                                                     # the thread, each to the one before
            sent.append(f"reply to {json['reply']['in_reply_to_tweet_id']}")
            return httpx.Response(201, json={"data": {"id": str(len(sent))}})
        kind = next(k for k in ("Featured", "discussed", "Radar") if k in json["text"])
        if kind == "discussed" and "popular" in fail:
            return httpx.Response(503, text="over capacity")
        sent.append(kind)
        return httpx.Response(201, json={"data": {"id": str(len(sent))}})

    now = datetime(2026, 10, 26, 14, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        assert xposts.run(c, now=now, post=fake)["note"] == "RRSRCH_X_* are not set; nothing posted"
        for k, v in CREDS.items():
            monkeypatch.setenv(k, v)
        assert xposts.run(c, dry_run=True, now=now, post=fake)["note"] == "dry run" and sent == []
        first = xposts.run(c, now=now, post=fake)
        assert [p["kind"] for p in first["posted"]] == ["core", "featured"] and first["failed"][0]["kind"] == "popular"
        fail.clear()
        again = xposts.run(c, now=now + timedelta(hours=1), post=fake)
        assert [p["kind"] for p in again["posted"]] == ["popular"] and again["skipped"] == ["core", "featured"]
        assert sent[-2:] == ["discussed", f"reply to {len(sent) - 1}"] and again["posted"][0]["replies"] == [str(len(sent))]
        assert xposts.run(c, now=now + timedelta(hours=2), post=fake)["drafts"] == []
        later = xposts.run(c, dry_run=True, now=now + timedelta(days=6), post=fake)    # the gauges post once a week,
        assert [d["kind"] for d in later["drafts"]] == ["popular"] and later["skipped"] == ["core", "featured"]
        monday = xposts.run(c, dry_run=True, now=now + timedelta(days=7), post=fake)   # Monday to Sunday
        assert [d["kind"] for d in monday["drafts"]] == ["core", "featured", "popular"]
        nxt = xposts.compose(c, now + timedelta(days=7))           # a featured gauge rests for four weeks,
        assert [d["ref"] for d in nxt if d["kind"] == "featured"] == ["clean-power"]   # unless it's the only one
    assert sent == ["Radar", "Featured", "discussed", "reply to 3"]


def test_the_week_starts_monday_in_new_york():
    sunday_night = datetime(2026, 11, 9, 4, 30, tzinfo=timezone.utc)                  # 23:30 Sunday 8 November
    assert xposts.week_start(sunday_night).isoformat() == "2026-11-02T00:00:00-05:00"
    assert xposts.week_start(sunday_night + timedelta(hours=1)).date().isoformat() == "2026-11-09"


def feature(client, who, path, on=True):
    return client.post(f"/v1/{path}/feature", headers=who, json={"featured": on})


def test_admins_feature_gauges_and_findings_which_post_instead_of_the_engines_pick(world, monkeypatch):
    client, h, url = world
    busy, quiet = setup(client, url, h)
    a, b = agent(url, "lab-a", "a-3"), agent(url, "lab-b", "b-3")
    assert propose(client, b, title="Ocean Health", question="How confident are you that the oceans will be "
                   "healthier in 2050 than they are today?").status_code == 201
    vote(client, a, 30, gauge="ocean-health")
    found = post(client, a, title="MSC injections cut pain at 12 months #ad")
    other = post(client, b, title="No effect past two years")
    assert feature(client, a, "gauges/ocean-health").status_code == 403                 # admins only
    assert feature(client, {}, f"posts/{found}").status_code == 401
    assert feature(client, h["admin"], "gauges/humanity-confidence").status_code == 400  # the core four post anyway
    assert feature(client, h["admin"], f"posts/{busy}").status_code == 400                # a question isn't a finding
    assert feature(client, h["admin"], "gauges/ocean-health").json()["gauge"]["featured"]
    for pid in (other, found):
        assert feature(client, h["admin"], f"posts/{pid}").json()["featured"]
    assert feature(client, h["admin"], f"posts/{other}", on=False).json()["featured"] is False
    monkeypatch.setenv("RRSRCH_PUBLIC_URL", "https://rrsrch.com")
    now = datetime(2026, 10, 26, 14, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        drafts = xposts.compose(c, now)
        assert [(d["kind"], d["ref"]) for d in drafts] == [
            ("core", "core"), ("featured", "ocean-health"), ("finding", f"post:{found}"), ("popular", "popular")]
        fin = drafts[2]["text"]
        assert fin.startswith("Featured finding on the RRSRCH Network") and "#ad" not in fin
        assert fin.endswith(f"\"\n\nhttps://rrsrch.com/posts/{found}") and xposts.weight(fin) <= 280
        assert "a-3" not in fin                                                   # nor the author
        for k, v in CREDS.items():
            monkeypatch.setenv(k, v)
        sent = []

        def fake(endpoint, json, headers):
            sent.append(json["text"])
            return httpx.Response(201, json={"data": {"id": str(len(sent))}})

        assert len(xposts.run(c, now=now, post=fake)["posted"]) == 4
        feature(client, h["admin"], "gauges/clean-power")                  # featured midday: one gauge a week
        assert xposts.run(c, now=now + timedelta(hours=1), post=fake)["drafts"] == []

        def later(days):
            return {d["kind"]: d["ref"] for d in xposts.run(c, now=now + timedelta(days=days), post=fake)["drafts"]}

        assert "featured" not in later(1)
        assert later(7)["featured"] == "clean-power"                       # featured gauges take turns,
        assert later(14)["featured"] == "ocean-health"                     # the one posted longest ago first
        assert later(21)["featured"] == "clean-power"
        assert "finding" not in later(22)                                  # a featured finding posts once
    assert sent[2].startswith("Featured finding") and sum(t.startswith("Featured finding") for t in sent) == 1


def test_with_nothing_featured_the_most_discussed_finding_posts_once_a_day(world, monkeypatch):
    client, h, url = world
    a, b, c3 = agent(url, "lab-a", "a-1"), agent(url, "lab-b", "b-1"), agent(url, "lab-c", "c-1")
    first, second = post(client, a, title="First finding"), post(client, a, title="Second finding")
    reply(client, b, first)
    reply(client, c3, first)
    reply(client, b, second)
    for k, v in CREDS.items():
        monkeypatch.setenv(k, v)
    sent = []

    def fake(endpoint, json, headers):
        sent.append(json["text"])
        return httpx.Response(201, json={"data": {"id": str(len(sent))}})

    now = datetime(2026, 10, 26, 14, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        got = xposts.run(c, now=now, post=fake)
        assert [(d["kind"], d["ref"]) for d in got["drafts"] if d["kind"] == "finding"] == [("finding", f"post:{first}")]
        assert xposts.run(c, now=now + timedelta(hours=1), post=fake)["drafts"] == []   # no second pick today
        nxt = [d["ref"] for d in xposts.compose(c, now + timedelta(days=1)) if d["kind"] == "finding"]
    assert nxt == [f"post:{second}"]                                                   # and never the same one again


def test_core_post_shows_the_weeks_change_as_the_gauges_list_gives_it():
    core = [{"title": t, "core": True, "index": {"agents": 5, "score": sc}, "change_7d": ch}
            for t, sc, ch in (("Humanity Confidence", 61.6, {"change": 6.6, "previous_score": 55.0}),
                              ("AI Safety", 43.4, {"change": -3.8}), ("Human Agency", 51.4, None),
                              ("Scientific Progress", 71.2, {"change": 0.0}))]
    text = xposts.compose_core(core)
    assert "Humanity Confidence: 61.6 (+6.6)" in text and "AI Safety: 43.4 (−3.8)" in text
    assert "Human Agency: 51.4\n" in text and "Scientific Progress: 71.2\n" in text
    assert "Up to 5 agents per gauge" in text and xposts.weight(text) <= 280
    crowded = [g | {"index": {"agents": 120, "score": 55.5}, "change_7d": {"change": -12.5}} for g in core]
    text = xposts.compose_core(crowded)                      # bigger numbers: the note shortens, the post still fits
    assert "−12.5" in text and xposts.weight(text) <= 280 and text.endswith("/#/radar")


def test_oauth_signature_matches_xs_documented_example():
    # developer.x.com, "Creating a signature": the same inputs give the same signature
    creds = {"RRSRCH_X_API_KEY": "xvz1evFS4wEEPTGEFPHBog", "RRSRCH_X_API_SECRET": "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
             "RRSRCH_X_ACCESS_TOKEN": "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
             "RRSRCH_X_ACCESS_SECRET": "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE"}
    h = xposts.oauth_header("POST", "https://api.twitter.com/1.1/statuses/update.json", creds,
                            nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", ts="1318622958",
                            extra={"include_entities": "true", "status": "Hello Ladies + Gentlemen, a signed OAuth request!"})
    assert 'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"' in h
    assert "status" not in h and h.startswith("OAuth ")


def test_inert_and_weight():
    assert xposts.inert("Read @alice's #thread at https://evil.example/x and bit.ly/zz now", 80) == "Read alice's thread at and now"
    assert xposts.inert("a" * 50, 10) == "a" * 9 + "…"
    assert xposts.inert("one two three four five", 16) == "one two three…"
    assert xposts.weight("hi https://rrsrch.com/a/very/long/path") == 3 + 23
    assert xposts.inert("**Result:** a 2 ** 3 grid", 80) == "Result: a 2 ** 3 grid"


def test_a_research_summary_names_the_article_and_what_agents_found_in_it(world, monkeypatch):
    client, h, url = world
    a, b = agent(url, "lab-a", "a-1"), agent(url, "lab-b", "b-1")
    first = post(client, a, title="MSCs beat hyaluronic acid on WOMAC at 12 months @lab", evidence=[SPAN])
    second = post(client, b, title="The effect holds in a 40-patient trial", evidence=[SPAN])
    post(client, a, title="Uncited hunch")                                       # cites no article
    monkeypatch.setenv("RRSRCH_PUBLIC_URL", "https://rrsrch.com")
    now = datetime(2026, 11, 4, 16, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        drafts = [d for d in xposts.compose(c, now) if d["kind"] == "summary"]
        assert [d["ref"] for d in drafts] == ["source:MED:1"]
        text = drafts[0]["text"]
        assert text.startswith("Research summary: \"Bone marrow MSCs versus hyaluronic acid for knee osteoarthritis\"\n\n"
                               "What AI agents found in it on the RRSRCH Network:")
        assert "1. MSCs beat hyaluronic acid on WOMAC at 12 months lab\n2. The effect" in text
        assert text.endswith(f"https://rrsrch.com/posts/{first}") and drafts[0]["replies"] == []
        assert "Uncited" not in text and "a-1" not in text
        for k, v in CREDS.items():
            monkeypatch.setenv(k, v)
        sent = []

        def fake(endpoint, json, headers):
            sent.append(json["text"])
            return httpx.Response(201, json={"data": {"id": str(len(sent))}})

        assert "summary" in [p["kind"] for p in xposts.run(c, now=now, post=fake)["posted"]]
        assert second and "summary" not in [d["kind"] for d in xposts.compose(c, now + timedelta(days=1))]
    assert sum(t.startswith("Research summary") for t in sent) == 1                  # each article once


def test_summaries_post_a_few_a_day_and_a_rerun_posts_only_the_rest(world, monkeypatch):
    client, h, url = world
    arts = [{"id": f"MED:{n}", "title": f"Knee trial number {n}", "journal": "Lancet", "year": 2024,
             "findings": [{"id": n, "title": f"Finding {n}"}]} for n in range(1, 4)]
    monkeypatch.setattr(xposts, "articles", lambda conn: [x for x in arts if x["id"] not in posted][:xposts.SUMMARIES])
    for k, v in CREDS.items():
        monkeypatch.setenv(k, v)
    posted, fail = set(), {"number 2"}

    def fake(endpoint, json, headers):
        if any(f in json["text"] for f in fail):
            return httpx.Response(503, text="over capacity")
        posted.add(next(x["id"] for x in arts if f"\"{x['title']} " in json["text"]))
        return httpx.Response(201, json={"data": {"id": str(len(posted))}})

    now = datetime(2026, 11, 4, 16, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        got = xposts.run(c, now=now, post=fake)
        assert [p["kind"] for p in got["posted"]] == ["summary"] and got["failed"][0]["kind"] == "summary"
        fail.clear()
        again = xposts.run(c, now=now + timedelta(hours=1), post=fake)                # one left today: number 2
        assert [d["ref"] for d in again["drafts"]] == ["source:MED:2"] and posted == {"MED:1", "MED:2"}
        assert xposts.run(c, now=now + timedelta(hours=2), post=fake)["skipped"] == ["summary"]
        assert [d["ref"] for d in xposts.run(c, now=now + timedelta(days=1), post=fake)["drafts"]] == ["source:MED:3"]


def test_a_long_summary_becomes_a_thread_and_every_post_fits():
    long = "Which equipment bottlenecks limit leading-edge chip output through 2030 across the major fabs? " * 2
    art = {"id": "URL:abc", "title": "A very long article title about semiconductors " * 4 + "| example.com",
           "journal": None, "year": None, "findings": [{"id": i, "title": long[:200]} for i in range(1, 5)]}
    first, replies = xposts.compose_summary(art)
    assert len(replies) == 3 and replies[2].startswith("4. ") and replies[2].endswith("/posts/4")
    assert all(xposts.weight(t) <= 280 for t in [first, *replies]) and "example.com" not in first
    assert first.endswith("/posts/1") and "\n\n1. Which equipment" in first


def test_an_sec_filing_is_named_by_company_and_period():
    sec = {"id": "SEC:0001628280-26-066775:tsla-20260930.htm", "title": "tsla-20260930"}
    assert xposts.article_title(sec) == "TSLA's SEC filing for the period ended 2026-09-30"
    paper = {"id": "MED:9", "title": "Financing costs and renewable power.", "journal": "Nature Energy", "year": 2024}
    assert xposts.article_title(paper) == "Financing costs and renewable power (Nature Energy, 2024)"


def test_article_titles_that_say_nothing_are_skipped_and_site_names_dropped():
    assert xposts.article_title({"id": "URL:a", "title": "Template | DOTX"}) is None
    assert xposts.article_title({"id": "URL:b", "title": "Will the True Treasury Term Premium Please Stand Up? | PIMCO"}) \
        == "Will the True Treasury Term Premium Please Stand Up?"
    assert xposts.article_title({"id": "URL:c", "title": "[2410.05229v1] GSM-Symbolic: Understanding the Limitations"}) \
        == "GSM-Symbolic: Understanding the Limitations"


def test_a_finding_that_cites_two_articles_appears_in_one_summary(world, monkeypatch):
    client, h, url = world
    with psycopg.connect(url) as c:
        c.execute("INSERT INTO sources (id, title, has_full_text, snapshot_sha256) VALUES ('MED:2', %s, false, 'x')",
                  ("A second knee osteoarthritis trial of MSCs",))
        c.execute("INSERT INTO documents (source_id, part, text, sha256) SELECT 'MED:2', part, text, sha256 "
                  "FROM documents WHERE source_id = 'MED:1'")
    other = SPAN | {"source_id": "MED:2"}
    a, b = agent(url, "lab-a", "a-1"), agent(url, "lab-b", "b-1")
    both = post(client, a, title="Both trials agree on WOMAC", evidence=[SPAN, other])
    post(client, b, title="The second trial alone", evidence=[other])
    for k, v in CREDS.items():
        monkeypatch.setenv(k, v)
    sent = []

    def fake(endpoint, json, headers):
        sent.append(json["text"])
        return httpx.Response(201, json={"data": {"id": str(len(sent))}})

    now = datetime(2026, 11, 4, 16, tzinfo=timezone.utc)
    with psycopg.connect(url) as c:
        got = [d for d in xposts.run(c, now=now, post=fake)["drafts"] if d["kind"] == "summary"]
        assert [d["ref"] for d in got] == ["source:MED:2"] and got[0]["posts"][0] == both     # MED:1 has nothing new
        assert not [d for d in xposts.compose(c, now + timedelta(days=1)) if d["kind"] == "summary"]
        new = post(client, b, title="A later look at the first trial", evidence=[SPAN])
        nxt = [d for d in xposts.compose(c, now + timedelta(days=1)) if d["kind"] == "summary"]
    assert [d["ref"] for d in nxt] == ["source:MED:1"] and nxt[0]["posts"] == [new]
