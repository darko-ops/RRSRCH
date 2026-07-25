"""Smoke tests for atlas_mcp.py — the read-only MCP surface answering over an
exported atlas_graph.json. ATLAS_GRAPH must be set BEFORE the module is imported:
atlas_mcp resolves the graph path at import time (and sys.exit()s if none is
found), so the env is pointed at the committed fixture here first."""
from __future__ import annotations

import os
import pathlib

_FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "atlas_graph.json"
os.environ["ATLAS_GRAPH"] = str(_FIXTURE)

import atlas_mcp  # noqa: E402 — env must be set before this import


def test_summary_counts_states_and_reports_drift():
    s = atlas_mcp.atlas_summary()
    assert s["title"] == "Atlas — demo"
    assert s["edge_states"] == {"confirmed": 1, "phantom": 1, "undecidable": 1}
    # drift = phantom + shadow, and excludes undecidable (a gap, not drift)
    drift_states = {d["state"] for d in s["drift"]}
    assert drift_states == {"phantom"}
    assert s["could_not_determine"] == 1


def test_nodes_lists_every_component():
    ids = {n["id"] for n in atlas_mcp.atlas_nodes()}
    assert ids == {"app:demo", "db:postgres", "ext:stripe", "ext:openai"}


def test_edges_filter_by_state_and_node():
    assert len(atlas_mcp.atlas_edges()) == 3
    assert [e["dst"] for e in atlas_mcp.atlas_edges(state="confirmed")] == ["db:postgres"]
    stripe = atlas_mcp.atlas_edges(node="stripe")
    assert len(stripe) == 1 and stripe[0]["state"] == "phantom"


def test_edge_returns_full_provenance_for_a_unique_match():
    e = atlas_mcp.atlas_edge("app:demo", "openai")
    assert e["state"] == "undecidable"
    assert e["missing_connector"]  # the connector that would decide it


def test_edge_reports_ambiguity_instead_of_guessing():
    # "app:demo" -> "ext:" matches multiple edges; the tool must not pick one
    res = atlas_mcp.atlas_edge("app:demo", "ext:")
    assert "error" in res
    assert len(res["candidates"]) == 2


def test_blast_radius_is_conservative():
    br = atlas_mcp.blast_radius("db:postgres")
    assert br["if_down"] == "db:postgres"
    # the app queries postgres -> app is degraded (never promoted to down)
    assert br["degraded"] == ["app:demo"]
    assert [e["dst"] for e in br["severed"]] == ["db:postgres"]


def test_gaps_expose_the_honest_unknowns():
    gaps = atlas_mcp.atlas_gaps()
    assert len(gaps) == 1
    assert "openai" in gaps[0]["edge"]
    assert gaps[0]["connector_to_install"]
