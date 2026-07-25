#!/usr/bin/env python3
"""Reranker A/B on the question-equivalence eval set (MiniLM + cross-encoders).

Two evaluation modes, both on the GROUP-AWARE split (thresholds tuned on the
calibration slice ONLY; every reported comparison is on the held-out test slice):

PAIR MODE — grades the decision function directly on every labeled pair:
  (a) fused >= T                      (today's baseline; T swept for the frontier)
  (b) fused >= T + intent gates       (polarity/predicate/facet — today's prod path)
  (c) safety gates + cross-encoder >= R
      variants: stsb primary alone; stsb + QQP veto (the shipped composite);
      each with the facet gate on and off.

Operating rules calibrated on cal: "fp0" = max recall at ZERO false hits;
"fp1" = max recall at <= 1 false hit (fp0 is brittle: one label-marginal
negative out of 233 dictates the threshold).

RETRIEVAL MODE — leave-one-out through the REAL Corpus.search() on the test
slice: every test question searches a corpus of the other 93; the served pair is
graded against the labels. Any served-but-unlabeled pair is PRINTED for
adjudication, never silently scored.

Zero LLM calls, zero derivations: MiniLM + local cross-encoders only.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from uuid import UUID

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "src"))

from rrsrch import agreement  # noqa: E402
from rrsrch.config import Settings  # noqa: E402
from rrsrch.corpus import Corpus  # noqa: E402
from rrsrch.embeddings import LocalSentenceTransformerEmbedder  # noqa: E402
from rrsrch.matching.lexical import lexical_score  # noqa: E402
from rrsrch.matching.rerank import get_reranker  # noqa: E402
from rrsrch.schemas import DepositIn  # noqa: E402
from rrsrch.store.memory import InMemoryStore  # noqa: E402

EVAL = os.path.join(HERE, "eval")
REPORTS = os.path.join(HERE, "reports")
PROD_T = 0.525


def load():
    qs = json.load(open(os.path.join(EVAL, "equivalence_questions.json")))["questions"]
    pairs = json.load(open(os.path.join(EVAL, "equivalence_pairs.json")))["pairs"]
    split = json.load(open(os.path.join(EVAL, "equivalence_split.json")))
    return qs, pairs, split


def score_pairs(qs, pairs, rr_primary, rr_veto):
    """fused + cross-encoder scores per labeled pair, via the SAME
    Reranker.score_pairs the serve path uses (one scoring path, one scale),
    plus intent verdicts with and without the facet gate."""
    text = {q["id"]: q["text"] for q in qs}
    emb_model = LocalSentenceTransformerEmbedder()
    ids = sorted(text)
    embs = emb_model.encode([text[i] for i in ids])
    emap = {i: embs[k] for k, i in enumerate(ids)}
    ex = agreement.RegexExtractor()
    fields = {i: ex.extract(text[i]) for i in ids}
    batch = [(text[p["a"]], text[p["b"]]) for p in pairs]
    ce = rr_primary.score_pairs(batch)
    cev = rr_veto.score_pairs(batch)
    rows = []
    for p, s, sv in zip(pairs, ce, cev):
        a, b = p["a"], p["b"]
        cos = float(np.dot(emap[a], emap[b]))
        fused = 0.7 * cos + 0.3 * lexical_score(text[a], text[b])
        ivf = agreement.intent_verdict(fields[a], fields[b], facet_gate=True)
        ivn = agreement.intent_verdict(fields[a], fields[b], facet_gate=False)
        rows.append({**{k: p[k] for k in ("a", "b", "label", "split")},
                     "fused": round(fused, 4), "ce": round(float(s), 4),
                     "ce_veto": round(float(sv), 4),
                     "gate_facet": ivf.match, "gate_nofacet": ivn.match,
                     "gate_rule": ivf.rule})
    return rows


def tally(decisions):
    served = [lab for lab, s in decisions if s]
    tp = sum(1 for lab in served if lab == "MATCH")
    pp = sum(1 for lab in served if lab == "PARTIAL")
    fp = sum(1 for lab in served if lab == "NO_MATCH")
    pos = sum(1 for lab, _ in decisions if lab == "MATCH")
    n = len(served)
    return {"served": n, "TP": tp, "PARTIAL": pp, "FP": fp,
            "precision_strict": round(tp / n, 3) if n else None,
            "false_hit_rate": round(fp / n, 3) if n else None,
            "recall": round(tp / pos, 3) if pos else None}


def sweep(rows, decide, grid):
    return [{"threshold": round(t, 3), **tally([(r["label"], decide(r, t)) for r in rows])}
            for t in grid]


def operating_points(curve):
    """fp0 = max recall @ FP=0 (lowest such threshold); fp1 = same @ FP<=1."""
    out = {}
    for name, keep in (("fp0", 0), ("fp1", 1)):
        ok = [c for c in curve if c["FP"] <= keep]
        out[name] = (max(ok, key=lambda c: (c["recall"] or 0, -c["threshold"]))["threshold"]
                     if ok else None)
    return out


async def retrieval_mode(qs, pairs, split, configs):
    label = {}
    for p in pairs:
        label[(p["a"], p["b"])] = p["label"]
        label[(p["b"], p["a"])] = p["label"]
    test_q = [q for q in qs if split[q["id"]] == "test"]
    text_to_id = {q["text"]: q["id"] for q in qs}
    embedder = LocalSentenceTransformerEmbedder()
    has_match = {q["id"]: any(label.get((q["id"], o["id"])) == "MATCH"
                              for o in test_q if o["id"] != q["id"]) for q in test_q}
    out, unlabeled = {}, []
    real_iv = agreement.intent_verdict
    for name, cfg in configs.items():
        s = Settings(store="memory", embedder="local", provider="none", **cfg["over"])
        corpus = Corpus(InMemoryStore(), embedder, s, provider=None,
                        reranker=cfg.get("reranker"))
        agreement.intent_verdict = (real_iv if cfg["guard"] else
                                    (lambda qf, cf, *, facet_gate=True:
                                     agreement.IntentVerdict(True, "guard_off", {})))
        try:
            recs = {}
            for q in test_q:
                recs[q["id"]] = await corpus.deposit(
                    DepositIn(query=q["text"], claim=f"[claim for {q['id']}]"))
            decisions = []
            for q in test_q:
                own = recs[q["id"]]
                corpus.store._d.pop(own.id)               # leave-one-out
                res = await corpus.search(q["text"])
                corpus.store._d[own.id] = own
                if res.serve:
                    served_rec = await corpus.store.get(UUID(res.deposit_id))
                    cand_id = text_to_id[served_rec.query]
                    lab = label.get((q["id"], cand_id))
                    if lab is None:
                        unlabeled.append({"config": name, "q": q["text"],
                                          "cand": served_rec.query,
                                          "qid": q["id"], "cid": cand_id})
                    decisions.append((q["id"], cand_id, lab, res.similarity))
        finally:
            agreement.intent_verdict = real_iv
        served = decisions
        tp = sum(1 for d in served if d[2] == "MATCH")
        pp = sum(1 for d in served if d[2] == "PARTIAL")
        fp = sum(1 for d in served if d[2] == "NO_MATCH")
        unl = sum(1 for d in served if d[2] is None)
        matched_qs = {d[0] for d in served if d[2] == "MATCH"}
        denom = sum(1 for hm in has_match.values() if hm)
        out[name] = {"queries": len(test_q), "served": len(served), "TP": tp,
                     "PARTIAL": pp, "FP": fp, "unlabeled": unl,
                     "precision_strict": round(tp / len(served), 3) if served else None,
                     "false_hit_rate": round(fp / len(served), 3) if served else None,
                     "recall_questions": round(len(matched_qs) / denom, 3) if denom else None,
                     "recall_denominator": denom,
                     "serves": [{"q": d[0], "cand": d[1], "label": d[2], "sim": d[3]}
                                for d in served]}
    return out, unlabeled


def main():
    qs, pairs, split = load()
    s_default = Settings(store="memory", embedder="local", reranker="local")
    rr_veto = get_reranker(s_default)                      # shipped composite
    rr_primary = get_reranker(Settings(store="memory", embedder="local",
                                       reranker="local", rerank_veto_model=""))
    scored = score_pairs(qs, pairs, rr_primary, rr_veto)
    cal = [r for r in scored if r["split"] == "cal"]
    test = [r for r in scored if r["split"] == "test"]

    fused_grid = [t / 1000 for t in range(400, 861, 5)]
    ce_grid = [t / 1000 for t in range(20, 981, 2)]

    def curves_for(rows):
        return {
            "a_fused": sweep(rows, lambda r, t: r["fused"] >= t, fused_grid),
            "b_fused_gates": sweep(rows, lambda r, t: r["fused"] >= t and r["gate_facet"],
                                   fused_grid),
            "c_stsb_nofacet": sweep(rows, lambda r, t: r["gate_nofacet"] and r["ce"] >= t,
                                    ce_grid),
            "c_stsb_facet": sweep(rows, lambda r, t: r["gate_facet"] and r["ce"] >= t, ce_grid),
            "c_veto_nofacet": sweep(rows, lambda r, t: r["gate_nofacet"] and r["ce_veto"] >= t,
                                    ce_grid),
            "c_veto_facet": sweep(rows, lambda r, t: r["gate_facet"] and r["ce_veto"] >= t,
                                  ce_grid),
        }

    curves_cal, curves_test = curves_for(cal), curves_for(test)
    ops = {k: operating_points(v) for k, v in curves_cal.items()}

    def at(rows, key, gatekey, t):
        return tally([(r["label"], (r[gatekey] if gatekey else True) and r[key] >= t)
                      for r in rows])

    pair_test = {"a_fused@prod0.525": at(test, "fused", None, PROD_T),
                 "b_gates@prod0.525": at(test, "fused", "gate_facet", PROD_T)}
    for cfg, key, gatekey in [("a_fused", "fused", None),
                              ("c_stsb_nofacet", "ce", "gate_nofacet"),
                              ("c_veto_nofacet", "ce_veto", "gate_nofacet"),
                              ("c_veto_facet", "ce_veto", "gate_facet")]:
        for rule in ("fp0", "fp1"):
            t = ops[cfg][rule]
            if t is not None:
                pair_test[f"{cfg}@{rule}={t}"] = at(test, key, gatekey, t)

    retr_configs = {
        "a_threshold_only": dict(reranker=None, guard=False,
                                 over={"similarity_threshold": PROD_T}),
        f"a_strict@{ops['a_fused']['fp0']}": dict(
            reranker=None, guard=False,
            over={"similarity_threshold": ops["a_fused"]["fp0"]}),
        "b_gates": dict(reranker=None, guard=True,
                        over={"similarity_threshold": PROD_T, "facet_gate": True}),
        f"c_veto@fp1={ops['c_veto_nofacet']['fp1']}": dict(
            reranker=rr_veto, guard=True,
            over={"reranker": "local", "facet_gate": False,
                  "rerank_threshold": ops["c_veto_nofacet"]["fp1"]}),
        f"c_veto@fp0={ops['c_veto_nofacet']['fp0']}": dict(
            reranker=rr_veto, guard=True,
            over={"reranker": "local", "facet_gate": False,
                  "rerank_threshold": ops["c_veto_nofacet"]["fp0"]}),
    }
    retr, unlabeled = asyncio.run(retrieval_mode(qs, pairs, split, retr_configs))

    out = {"operating_points_cal": ops, "pair_mode_test": pair_test,
           "curves_cal": curves_cal, "curves_test": curves_test,
           "retrieval_mode_test": retr}
    json.dump(out, open(os.path.join(REPORTS, "reranker_ab.json"), "w"), indent=1)
    print(json.dumps({"operating_points_cal": ops, "pair_mode_test": pair_test}, indent=1))
    print("\nretrieval mode (test slice):")
    for k, v in retr.items():
        print(f"  {k}: served={v['served']} TP={v['TP']} PARTIAL={v['PARTIAL']} "
              f"FP={v['FP']} unlabeled={v['unlabeled']} prec={v['precision_strict']} "
              f"falseHR={v['false_hit_rate']} recallQ={v['recall_questions']}/{v['recall_denominator']}")
    if unlabeled:
        print(f"\nUNLABELED served pairs needing adjudication: {len(unlabeled)}")
        for u in unlabeled:
            print(f"  [{u['config']}] {u['qid']} {u['q']}  ->  {u['cid']} {u['cand']}")
    json.dump(unlabeled, open(os.path.join(REPORTS, "reranker_ab_unlabeled.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
