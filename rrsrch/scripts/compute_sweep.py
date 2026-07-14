#!/usr/bin/env python3
"""Pass 2: apply hand + LLM-adjudicated labels to the sweep, compute metrics per
threshold, and the TRUE-vs-FALSE similarity diagnostic at 0.525."""
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(os.path.join(HERE, "reports", "sweep_raw.json")))

# LLM-adjudicated labels for pairs the sweep surfaced that had no hand label.
# FLAGGED as LLM-labeled (see reports/threshold_sweep.md). key=(query, matched).
NEW = {
    ("How Long Is the Validity of CMMC Certification?",
     "How long does the CMMC compliance process take?"): ("FALSE", "LLM"),
    ("How Long Is the Validity of CMMC Certification?",
     "How long is my CMMC certification valid?"): ("TRUE", "LLM/placeholder"),
    ("How much does CMMC compliance cost?",
     "How long does the CMMC compliance process take?"): ("FALSE", "LLM"),
    ("What Are the CMMC Requirements?",
     "What Is the CMMC Required by the DoD?"): ("FALSE", "LLM"),
    ("What's the deadline to get CMMC compliant?",
     "How long does the CMMC compliance process take?"): ("FALSE", "LLM"),
}


def label(h):
    if h["label"]:
        return h["label"], "hand"
    lab, src = NEW[(h["query"], h["matched_query"])]
    return lab, src


print(f"{'thr':>5} {'served':>6} {'rawHR':>6} {'T':>2} {'P':>2} {'F':>2} "
      f"{'prec_s':>7} {'prec_l':>7} {'TPrate':>7} {'falseHR':>8}")
table = []
for T, d in raw["sweep"].items():
    hits = d["hits"]
    labs = [label(h)[0] for h in hits]
    t, p, f = labs.count("TRUE"), labs.count("PARTIAL"), labs.count("FALSE")
    served = d["served"]
    row = {
        "threshold": float(T), "served": served, "raw_hit_rate": round(served / 44, 3),
        "true": t, "partial": p, "false": f,
        "precision_strict": round(t / served, 3) if served else None,
        "precision_lenient": round((t + p) / served, 3) if served else None,
        "tp_rate": round(t / 44, 3), "false_hit_rate": round(f / served, 3) if served else None,
        "placeholder_deposits": d["placeholder_deposits"],
    }
    table.append(row)
    print(f"{T:>5} {served:>6} {row['raw_hit_rate']:>6} {t:>2} {p:>2} {f:>2} "
          f"{str(row['precision_strict']):>7} {str(row['precision_lenient']):>7} "
          f"{row['tp_rate']:>7} {str(row['false_hit_rate']):>8}")

# --- diagnostic: TRUE vs FALSE similarity distributions at 0.525 ---
h0 = raw["sweep"]["0.525"]["hits"]
dist = {"TRUE": [], "PARTIAL": [], "FALSE": []}
for h in h0:
    dist[label(h)[0]].append(h["similarity"])
print("\n=== 0.525 similarity distributions ===")
for k in ("TRUE", "PARTIAL", "FALSE"):
    v = sorted(dist[k])
    if v:
        print(f"{k:>7} (n={len(v)}): {v}  min={min(v)} median={st.median(v)} max={max(v)}")
overlap_lo = max(min(dist["TRUE"]), min(dist["FALSE"]))
overlap_hi = min(max(dist["TRUE"]), max(dist["FALSE"]))
print(f"\nTRUE range [{min(dist['TRUE'])}, {max(dist['TRUE'])}]  "
      f"FALSE range [{min(dist['FALSE'])}, {max(dist['FALSE'])}]")
print(f"OVERLAP band [{overlap_lo}, {overlap_hi}]  (nonempty => not cleanly separable)")
cut = max(dist["FALSE"]) + 0.001  # threshold that kills all false hits
true_survivors = [x for x in dist["TRUE"] if x >= cut]
print(f"cutoff to zero false hits: >{max(dist['FALSE'])}  -> TRUE survivors {len(true_survivors)}/"
      f"{len(dist['TRUE'])} = {len(true_survivors)}/{len(dist['TRUE'])} kept, "
      f"{len(dist['TRUE'])-len(true_survivors)} true hits lost")

json.dump(table, open(os.path.join(HERE, "reports", "sweep_table.json"), "w"), indent=2)
