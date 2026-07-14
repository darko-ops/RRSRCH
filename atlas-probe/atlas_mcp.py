"""The agent-facing Atlas MCP server (stdio). THIN and read-only: every tool
answers from the exported attestation (atlas_graph.json) — no probing, no LLM,
no writes. Point ATLAS_GRAPH at an export; defaults to this probe's own.

Register (the shipped `atlas-mcp` console script):
  claude mcp add atlas --scope user \
      --env ATLAS_GRAPH=/path/to/atlas_graph.json \
      -- atlas-mcp
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

from mcp.server.fastmcp import FastMCP


def _graph_path() -> str:
    # ATLAS_GRAPH env, else an atlas_graph.json next to the cwd (running inside
    # a probe dir), else one next to this file (running the un-installed script)
    env = os.environ.get("ATLAS_GRAPH")
    if env:
        return env
    for candidate in (pathlib.Path.cwd() / "atlas_graph.json",
                      pathlib.Path(__file__).parent / "atlas_graph.json"):
        if candidate.exists():
            return str(candidate)
    sys.exit("atlas-mcp: no attestation found — set ATLAS_GRAPH=/path/to/atlas_graph.json")


GRAPH_PATH = _graph_path()

mcp = FastMCP("atlas")


def _graph() -> dict:
    # re-read per call: a re-run probe updates the file, the server needs no restart
    return json.load(open(GRAPH_PATH))


def _slim(e: dict) -> dict:
    return {k: e[k] for k in ("src", "dst", "kind", "state", "note") if k in e}


@mcp.tool()
def atlas_summary() -> dict:
    """Start here. What this attestation covers and how much of it is verified:
    title, as-of time, connectors used as evidence sources, edge counts by state
    (confirmed / phantom / shadow / hypothesis / undecidable), and the drift list
    (phantom = declared but not observed; shadow = observed but never declared).
    Drift counts exclude undecidable — those are evidence gaps, not drift."""
    g = _graph()
    counts: dict[str, int] = {}
    for e in g["edges"]:
        counts[e["state"]] = counts.get(e["state"], 0) + 1
    drift = [_slim(e) for e in g["edges"] if e["state"] in ("phantom", "shadow")]
    return {"title": g["title"], "as_of": g["as_of"],
            "connectors": g["connectors"], "edge_states": counts,
            "drift": drift, "could_not_determine": len(g["could_not_determine"])}


@mcp.tool()
def atlas_nodes() -> list[dict]:
    """Every component in the attested system (id, label, kind, attributes).
    Node ids are what blast_radius() and atlas_edges() match against."""
    return _graph()["nodes"]


@mcp.tool()
def atlas_edges(state: str = "", node: str = "") -> list[dict]:
    """List data-flow edges, slimmed (src, dst, kind, state, note). Filter by
    `state` (confirmed/phantom/shadow/hypothesis/undecidable) and/or `node`
    (substring of a node id, matches either end). Use atlas_edge() for one
    edge's full evidence."""
    edges = _graph()["edges"]
    if state:
        edges = [e for e in edges if e["state"] == state]
    if node:
        edges = [e for e in edges if node in e["src"] or node in e["dst"]]
    return [_slim(e) for e in edges]


@mcp.tool()
def atlas_edge(src: str, dst: str) -> dict:
    """Full record for one edge (substring match on both ends): state, sources
    (the evidence), and for unverified states why it could not be observed and
    which connector would decide it. This is the provenance answer — cite it."""
    hits = [e for e in _graph()["edges"] if src in e["src"] and dst in e["dst"]]
    if len(hits) != 1:
        return {"error": f"{len(hits)} edges match {src!r}->{dst!r}",
                "candidates": [f"{e['src']} -> {e['dst']}" for e in hits]}
    return hits[0]


@mcp.tool()
def blast_radius(node: str) -> dict:
    """What breaks if `node` (substring of a node id) goes down. Deterministic,
    deliberately conservative: direct dependents are DEGRADED (up, missing a
    dependency), never promoted to down — that over-claims. Also lists
    deliveries into degraded nodes (likely failing) and flows out of them
    (idle / at-risk)."""
    g = _graph()
    matches = [n["id"] for n in g["nodes"] if node in n["id"]]
    if len(matches) != 1:
        return {"error": f"{len(matches)} nodes match {node!r}", "candidates": matches}
    target, edges = matches[0], g["edges"]
    severed = [e for e in edges if e["dst"] == target]
    degraded = sorted({e["src"] for e in severed})
    failing_in = [e for e in edges if e["dst"] in degraded and e["src"] != target]
    idle_out = [e for e in edges if e["src"] in degraded
                and e["dst"] != target and e not in failing_in]
    return {"if_down": target,
            "severed": [_slim(e) for e in severed],
            "degraded": degraded,
            "likely_failing": [_slim(e) for e in failing_in],
            "idle_at_risk": [_slim(e) for e in idle_out]}


@mcp.tool()
def atlas_gaps() -> list[dict]:
    """The honest unknowns: edges no connected evidence source can decide,
    each with why and the connector that would close the gap. If an agent is
    about to assert something about these flows, it should say 'undecidable'
    instead of guessing."""
    return _graph()["could_not_determine"]


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
