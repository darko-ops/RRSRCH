"""The pilot report's two gates. What matters here is not the arithmetic but the
REFUSALS: an unjudged safety gate must never read as safe, and no amount of
token savings may compensate for a precision failure."""
from __future__ import annotations

import importlib.util
import pathlib

from rrsrch.config import Settings

_SPEC = importlib.util.spec_from_file_location(
    "pilot_report",
    pathlib.Path(__file__).resolve().parents[1] / "scripts" / "pilot_report.py")
pilot = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(pilot)

S = Settings(store="memory", embedder="hash", cold_path_estimate_tokens=90_000)


def _rep(**over):
    base = {
        "traces": 100, "hits": 70, "stale": 10, "misses": 20,
        "measured_cost": 30 * 50_000, "measured_n": 30,        # the 30 derivations
        "all_reported_cost": 100 * 50_000, "all_reported_n": 100,
        "warm_tokens": 70 * 22,
        "metrics": {"net_savings": {"verification_tokens_spent": 0}},
        "serves": [{"serve_id": f"srv-{i}"} for i in range(70)],
    }
    base.update(over)
    return base


# ---------------------------------------------------------------- gate A


def test_gate_a_prices_avoided_derivations_from_summed_actuals():
    a = pilot.gate_a(_rep(), S, floor=20.0)
    assert a["cost_basis"] == "measured"
    assert a["mean_derivation_tokens"] == 50_000.0
    assert a["derivations_avoided"] == 70          # 100 traces - 30 derivations
    assert a["tokens_without"] == 5_000_000
    assert a["verdict"] == "PASS"


def test_gate_a_coverage_is_over_derivations_not_all_traces():
    # only 15 of the 30 derivations reported a cost -> 50%, NOT 15/100
    a = pilot.gate_a(_rep(measured_n=15, measured_cost=15 * 50_000), S, floor=20.0)
    assert a["cost_coverage_pct"] == 50.0


def test_gate_a_discloses_when_it_had_to_fall_back_to_the_estimate():
    a = pilot.gate_a(_rep(all_reported_cost=0, all_reported_n=0,
                          measured_cost=0, measured_n=0), S, floor=20.0)
    assert a["cost_basis"].startswith("ESTIMATED")
    assert a["mean_derivation_tokens"] == 90_000.0   # the configured assumption
    assert a["trace_cost_coverage_pct"] == 0.0


def test_gate_a_fails_below_the_pre_registered_floor():
    # almost everything missed: little is avoided
    a = pilot.gate_a(_rep(hits=2, stale=0, misses=98, measured_n=98,
                          measured_cost=98 * 50_000, warm_tokens=44), S, floor=20.0)
    assert a["verdict"] == "FAIL"


def test_gate_a_charges_verification_against_the_savings():
    quiet = pilot.gate_a(_rep(), S, floor=20.0)
    noisy = pilot.gate_a(
        _rep(metrics={"net_savings": {"verification_tokens_spent": 400_000}}), S, floor=20.0)
    assert noisy["net_reduction_pct"] < quiet["net_reduction_pct"]
    assert noisy["verification_tokens"] == 400_000


# ---------------------------------------------------------------- gate B


def test_gate_b_is_undetermined_without_judgments_and_that_is_not_a_pass():
    b = pilot.gate_b(_rep(), judgments={}, floor=99.0)
    assert b["verdict"] == "UNDETERMINED"
    assert b["verdict"] != "PASS"
    assert "0 blind judgments" in b["reason"]


def test_gate_b_never_counts_an_unjudged_serve_as_correct():
    # only 2 of 70 serves judged, both correct: precision is 100% OF THE JUDGED,
    # and the coverage number is what exposes how thin that is
    b = pilot.gate_b(_rep(), judgments={"srv-0": True, "srv-1": True}, floor=99.0)
    assert b["judged"] == 2 and b["served"] == 70
    assert b["judgment_coverage_pct"] == 2.9
    assert b["precision_pct"] == 100.0


def test_gate_b_fails_just_below_the_bar():
    judgments = {f"srv-{i}": (i != 0) for i in range(70)}   # 69/70 = 98.57%
    b = pilot.gate_b(_rep(), judgments=judgments, floor=99.0)
    assert b["precision_pct"] == 98.57
    assert b["verdict"] == "FAIL"


def test_gate_b_undetermined_when_nothing_was_served():
    b = pilot.gate_b(_rep(serves=[]), judgments={}, floor=99.0)
    assert b["verdict"] == "UNDETERMINED"
    assert b["reason"] == "no answers were served"


# ------------------------------------------------------- gate INDEPENDENCE


def test_savings_can_never_buy_down_a_precision_failure():
    """The property the whole script exists to enforce."""
    rep = _rep()
    a = pilot.gate_a(rep, S, floor=20.0)
    b = pilot.gate_b(rep, judgments={f"srv-{i}": (i > 2) for i in range(70)}, floor=99.0)
    assert a["verdict"] == "PASS"          # excellent economics
    assert a["net_reduction_pct"] > 60
    assert b["verdict"] == "FAIL"          # 67/70 = 95.7% precision
    # neither verdict is a function of the other, and overall requires both
    assert not (a["verdict"] == "PASS" and b["verdict"] == "PASS")


def test_judgments_loader_ignores_rows_without_an_explicit_boolean(tmp_path):
    p = tmp_path / "j.jsonl"
    p.write_text('{"serve_id": "srv-0", "correct": true}\n'
                 '{"serve_id": "srv-1", "correct": null}\n'      # unjudged
                 '{"serve_id": "srv-2"}\n'                       # unjudged
                 '{"serve_id": "srv-3", "correct": false}\n')
    got = pilot.load_judgments(str(p))
    assert got == {"srv-0": True, "srv-3": False}       # silence is not consent
