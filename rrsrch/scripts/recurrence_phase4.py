#!/usr/bin/env python3
"""Phase 4: separability on NATURAL positives (cross-source paraphrases), stratified
by specificity — the goldilocks cross-tab. Reuses stored fused/ce from the blind-
labeled FAQ pairs (no matcher used for clustering; scores only graded, not labeled).
No derivations."""
import json
import os
import re
import statistics as st

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(HERE, "eval")
qs = {q["id"]: q for q in json.load(open(os.path.join(EVAL, "equivalence_questions.json")))["questions"]}
pairs = json.load(open(os.path.join(EVAL, "equivalence_pairs.json")))["pairs"]

_REG = re.compile(r"\b(rev\.?\s*[23]|level\s*[123]|\bL[123]\b|800-171|800-172|\d\.\d+\.\d+|"
                  r"CFR|DFARS|7012|7019|7020|7021)\b", re.I)
_TECH = re.compile(r"\b(GovCloud|GCC High|GCC|Azure|AWS|M365|Microsoft 365|VDI|enclave|MSP|"
                   r"MSSP|SIEM|FIPS|MFA|VPN|on-?prem|SPRS|POA&M|POAM|SSP|C3PAO|ESP|CSP|"
                   r"FedRAMP|CUI|FCI|encryption|multifactor|subnetwork|boundary)\b", re.I)
_SCEN = re.compile(r"\b(if|when|for a|as a|our|we're|we are|subcontractor|prime|COTS|DIB|"
                   r"small business|flow ?down|third-?party|scenario)\b", re.I)


def spec(t):
    return (2 * len({m.group(0).lower() for m in _REG.finditer(t)})
            + len({m.group(0).lower() for m in _TECH.finditer(t)})
            + len({m.group(0).lower() for m in _SCEN.finditer(t)}))


def bucket(s):
    return "generic" if s <= 1 else "moderate" if s <= 3 else "specific" if s <= 5 else "hyper"


def pair_bucket(p):   # a pair's specificity = the LOWER of its two questions
    return bucket(min(spec(qs[p["a"]]["text"]), spec(qs[p["b"]]["text"])))


def sep(pos, neg):
    if not pos or not neg:
        return {"n_pos": len(pos), "n_neg": len(neg), "recall_at_0fp": None,
                "pos_med": round(st.median(pos), 3) if pos else None,
                "neg_med": round(st.median(neg), 3) if neg else None}
    maxneg = max(neg)
    return {"n_pos": len(pos), "n_neg": len(neg),
            "pos_med": round(st.median(pos), 3), "neg_med": round(st.median(neg), 3),
            "pos_min": round(min(pos), 3), "neg_max": round(maxneg, 3),
            "recall_at_0fp": round(sum(x > maxneg for x in pos) / len(pos), 3)}


print("=== PHASE 4: NATURAL-positive separability, stratified by specificity ===")
print("(positives = real cross-source paraphrase pairs; negatives = real same-topic "
      "different-question pairs; all BLIND-labeled)\n")
out = {}
for metric in ("fused", "ce"):
    print(f"--- {metric} ---")
    print(f"{'bucket':10} {'n_pos':>6} {'n_neg':>6} {'pos_med':>8} {'neg_med':>8} "
          f"{'recall@0FP':>11}")
    out[metric] = {}
    for b in ("generic", "moderate", "specific", "hyper"):
        pos = [p[metric] for p in pairs if p["label"] == "MATCH" and pair_bucket(p) == b]
        neg = [p[metric] for p in pairs if p["label"] == "NO_MATCH" and pair_bucket(p) == b]
        s = sep(pos, neg)
        out[metric][b] = s
        r = s["recall_at_0fp"]
        print(f"{b:10} {s['n_pos']:>6} {s['n_neg']:>6} "
              f"{str(s['pos_med']):>8} {str(s['neg_med']):>8} "
              f"{(f'{r:.2f}' if r is not None else 'n/a'):>11}")
    print()

# Cross-reference: authored SPECIFIC positives (traffic_hypothesis) for contrast
th = json.load(open(os.path.join(HERE, "reports", "traffic_hypothesis.json")))
print("CONTRAST — authored SPECIFIC positives (traffic_hypothesis.md):")
for m in ("fused", "ce"):
    s = th["specific_distributions"][m]["separability"]
    print(f"  {m}: recall@0FP={s['recall_at_zero_fp']}  "
          f"(pos_min={th['specific_distributions'][m]['MATCH']['min']}, "
          f"neg_max={s['max_neg']})")
json.dump(out, open(os.path.join(HERE, "reports", "recurrence_phase4.json"), "w"), indent=1)
