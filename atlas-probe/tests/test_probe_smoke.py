"""Smoke tests for probe.py — the pure, network-free surface: credential
stripping, host parsing, the declared/observed -> edge-state machine, and the
multi-repo graph merge. The collectors (collect_declared/collect_observed) and
publish() shell out (git, curl, the site) and are intentionally NOT exercised
here — a smoke test proves the logic, not the network."""
from __future__ import annotations

import pathlib

import probe


def test_strip_credentials_removes_userinfo():
    assert probe.strip_credentials("postgres://user:pw@host:5432/db") == "postgres://host:5432/db"
    # no credentials -> unchanged
    assert probe.strip_credentials("https://api.stripe.com/v1") == "https://api.stripe.com/v1"


def test_host_of_parses_host_and_port():
    assert probe.host_of("postgres://user:pw@db.internal:5432/app") == "db.internal:5432"
    assert probe.host_of("https://rrsrch.com/path") == "rrsrch.com"
    assert probe.host_of("not a url") == ""


def _probe(tmp_path: pathlib.Path) -> probe.Probe:
    return probe.Probe(tmp_path)


def test_declared_and_observed_is_confirmed(tmp_path):
    p = _probe(tmp_path)
    p.declare("postgres", "filesystem", ".env has DATABASE_URL")
    p.observe("postgres", True, "docker ps", "container up on :5432")
    edge = _edge_to(p.graph(), "db:postgres")
    assert edge["state"] == "confirmed"


def test_declared_but_observed_absent_is_phantom(tmp_path):
    p = _probe(tmp_path)
    p.declare("postgres", "filesystem", ".env has DATABASE_URL")
    p.observe("postgres", False, "docker ps", "no container on :5432")
    edge = _edge_to(p.graph(), "db:postgres")
    assert edge["state"] == "phantom"


def test_declared_only_is_undecidable_and_listed_as_gap(tmp_path):
    p = _probe(tmp_path)
    p.declare("stripe", "filesystem", "STRIPE_SECRET_KEY present")
    g = p.graph()
    edge = _edge_to(g, "ext:stripe")
    assert edge["state"] == "undecidable"
    # an undecidable edge must surface as an honest gap with the connector to install
    assert any("ext:stripe" in c["edge"] for c in g["could_not_determine"])
    assert edge["missing_connector"]


def test_observed_only_is_shadow(tmp_path):
    p = _probe(tmp_path)
    p.observe("redis", True, "docker ps", "redis container up")
    edge = _edge_to(p.graph(), "db:redis")
    assert edge["state"] == "shadow"


def test_negative_observation_never_overwrites_a_positive(tmp_path):
    p = _probe(tmp_path)
    p.observe("postgres", True, "docker ps", "up")
    p.observe("postgres", False, "port check", "closed")  # must not win
    assert p.observed["postgres"][0] is True


def test_merge_graphs_unions_nodes_and_concats_edges():
    g1 = {"nodes": [{"id": "app:a"}, {"id": "db:postgres"}],
          "edges": [{"src": "app:a", "dst": "db:postgres"}],
          "could_not_determine": [], "connectors": ["filesystem"]}
    g2 = {"nodes": [{"id": "app:b"}, {"id": "db:postgres"}],  # shared node id
          "edges": [{"src": "app:b", "dst": "db:postgres"}],
          "could_not_determine": [], "connectors": ["curl (live domain)"]}
    merged = probe.merge_graphs("mysystem", [g1, g2])
    ids = {n["id"] for n in merged["nodes"]}
    assert ids == {"app:a", "app:b", "db:postgres"}  # db:postgres unioned, not duplicated
    assert len(merged["edges"]) == 2                  # every repo's edges kept
    assert set(merged["connectors"]) == {"filesystem", "curl (live domain)"}
    assert "mysystem" in merged["title"]


def _edge_to(graph: dict, dst: str) -> dict:
    hits = [e for e in graph["edges"] if e["dst"] == dst]
    assert len(hits) == 1, f"expected exactly one edge to {dst}, got {len(hits)}"
    return hits[0]
