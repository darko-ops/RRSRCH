#!/usr/bin/env python3
"""Traffic-hypothesis test: run the SAME scoring path (reranker_ab.score_pairs)
on the SPECIFIC-question set and compare separability to the FAQ set.

Phase 2: precision/recall/false-hit for (a) fused threshold and (c) cross-encoder.
Phase 3: POS-vs-HARD-NEG similarity distributions, specific vs FAQ, + verdict.

Zero LLM calls, zero derivations (MiniLM + local cross-encoders only)."""
import json
import os
import statistics as st

from reranker_ab import score_pairs, tally, sweep, operating_points  # SAME path, reused
from rrsrch.config import Settings
from rrsrch.matching.rerank import get_reranker

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(HERE, "eval")


def dist(vals):
    v = sorted(vals)
    q = st.quantiles(v, n=4) if len(v) > 1 else [v[0], v[0], v[0]]
    return {"n": len(v), "min": round(min(v), 3), "q25": round(q[0], 3),
            "median": round(st.median(v), 3), "q75": round(q[2], 3), "max": round(max(v), 3)}


def separability(pos, neg):
    """Recall achievable at ZERO false hits = fraction of positives strictly above
    the highest negative. 0 => inverted/non-separable."""
    maxneg = max(neg)
    kept = [x for x in pos if x > maxneg]
    return {"max_neg": round(maxneg, 3), "max_pos": round(max(pos), 3),
            "min_pos": round(min(pos), 3),
            "recall_at_zero_fp": round(len(kept) / len(pos), 3),
            "clean_threshold": round(maxneg + 1e-9, 3) if kept else None}


def main():
    spec_qs = json.load(open(os.path.join(EVAL, "specific_questions.json")))["questions"]
    spec_pairs = json.load(open(os.path.join(EVAL, "specific_pairs.json")))["pairs"]

    rr_veto = get_reranker(Settings(store="memory", embedder="local", reranker="local"))
    rr_primary = get_reranker(Settings(store="memory", embedder="local", reranker="local",
                                       rerank_veto_model=""))
    rows = score_pairs(spec_qs, spec_pairs, rr_primary, rr_veto)

    def by(label, key):
        return [r[key] for r in rows if r["label"] == label]

    # --- Phase 3: distributions + separability (specific) ---
    spec = {}
    for key in ("fused", "ce", "ce_veto"):
        pos, neg = by("MATCH", key), by("NO_MATCH", key)
        spec[key] = {"MATCH": dist(pos), "NO_MATCH": dist(neg),
                     "separability": separability(pos, neg)}

    # --- FAQ baseline from stored equivalence_pairs.json (same fused formula + CE model) ---
    faq = json.load(open(os.path.join(EVAL, "equivalence_pairs.json")))["pairs"]
    faq_out = {}
    for key in ("fused", "ce"):
        pos = [p[key] for p in faq if p["label"] == "MATCH"]
        neg = [p[key] for p in faq if p["label"] == "NO_MATCH"]
        faq_out[key] = {"MATCH": dist(pos), "NO_MATCH": dist(neg),
                        "separability": separability(pos, neg)}

    # --- Phase 2: precision/recall/false-hit, (a) fused and (c) cross-encoder ---
    fused_grid = [t / 1000 for t in range(300, 961, 5)]
    ce_grid = [t / 1000 for t in range(20, 981, 2)]
    curves = {
        "a_fused": sweep(rows, lambda r, t: r["fused"] >= t, fused_grid),
        "c_ce": sweep(rows, lambda r, t: r["ce"] >= t, ce_grid),
        "c_ce_veto": sweep(rows, lambda r, t: r["ce_veto"] >= t, ce_grid),
    }
    ops = {k: operating_points(v) for k, v in curves.items()}
    phase2 = {"a_fused@0.525": tally([(r["label"], r["fused"] >= 0.525) for r in rows]),
              "a_fused@0.71": tally([(r["label"], r["fused"] >= 0.71) for r in rows])}
    for cfg, key in (("a_fused", "fused"), ("c_ce", "ce"), ("c_ce_veto", "ce_veto")):
        for rule in ("fp0", "fp1"):
            t = ops[cfg][rule]
            if t is not None:
                phase2[f"{cfg}@{rule}={t}"] = tally([(r["label"], r[key] >= t) for r in rows])

    out = {"specific_distributions": spec, "faq_distributions": faq_out,
           "phase2_metrics": phase2, "operating_points": ops}
    json.dump(out, open(os.path.join(HERE, "reports", "traffic_hypothesis.json"), "w"), indent=1)

    print("=== PHASE 3: separability (recall achievable at ZERO false hits) ===")
    for key in ("fused", "ce"):
        s, f = spec[key]["separability"], faq_out[key]["separability"]
        print(f"{key:8} SPECIFIC: pos[{spec[key]['MATCH']['min']}..{spec[key]['MATCH']['max']}] "
              f"neg[..{s['max_neg']}] -> recall@0FP={s['recall_at_zero_fp']}   ||  "
              f"FAQ: pos[..{faq_out[key]['MATCH']['max']}] neg[..{f['max_neg']}] "
              f"-> recall@0FP={f['recall_at_zero_fp']}")
    print("\n=== PHASE 2: specific-set metrics ===")
    for k, v in phase2.items():
        print(f"  {k}: served={v['served']} TP={v['TP']} FP={v['FP']} "
              f"prec={v['precision_strict']} falseHR={v['false_hit_rate']} recall={v['recall']}")
    print("\nwrote reports/traffic_hypothesis.json")


if __name__ == "__main__":
    main()
