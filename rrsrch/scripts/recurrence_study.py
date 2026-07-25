#!/usr/bin/env python3
"""Recurrence / goldilocks study on the REAL 11-origin FAQ corpus (blind labels).

Phase 1: deterministic specificity score per question -> buckets.
Phase 2: clusters = connected components over BLIND MATCH labels (NOT the matcher).
Phase 3: cross-source recurrence, overall + stratified by specificity.
No derivations, no matcher scores used for clustering."""
import json
import os
import re
from collections import Counter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(HERE, "eval")

qs = {q["id"]: q for q in json.load(open(os.path.join(EVAL, "equivalence_questions.json")))["questions"]}
pairs = json.load(open(os.path.join(EVAL, "equivalence_pairs.json")))["pairs"]


def origin(qid):
    return qs[qid]["origin"].split("—")[0].split("-")[0].strip()


# --- Phase 1: specificity rubric (count distinguishing constraints) ---
# Deterministic. Three signal classes; a question's score = total distinct hits.
_REG = re.compile(r"\b(rev\.?\s*[23]|level\s*[123]|\bL[123]\b|800-171|800-172|"
                  r"\d\.\d+\.\d+|CFR|DFARS|7012|7019|7020|7021|32 CFR|48 CFR)\b", re.I)
_TECH = re.compile(r"\b(GovCloud|GCC High|GCC|Azure|AWS|M365|Microsoft 365|VDI|enclave|"
                   r"MSP|MSSP|MSA|SIEM|FIPS|MFA|VPN|on-?prem|SPRS|POA&M|POAM|SSP|C3PAO|"
                   r"ESP|CSP|FedRAMP|CUI|FCI|encryption|multifactor|subnetwork|boundary)\b", re.I)
_SCEN = re.compile(r"\b(if|when|for a|as a|our|we're|we are|subcontractor|prime|COTS|DIB|"
                   r"small business|flow ?down|third-?party|scenario)\b", re.I)


def specificity(text):
    reg = len(set(m.group(0).lower() for m in _REG.finditer(text)))
    tech = len(set(m.group(0).lower() for m in _TECH.finditer(text)))
    scen = len(set(m.group(0).lower() for m in _SCEN.finditer(text)))
    return reg * 2 + tech + scen   # control-IDs/versions weighted x2 (strong signal)


def bucket(s):
    return ("generic" if s <= 1 else "moderate" if s <= 3 else
            "specific" if s <= 5 else "hyper-specific")


for q in qs.values():
    q["spec"] = specificity(q["text"])
    q["bucket"] = bucket(q["spec"])

# --- Phase 2: connected components over BLIND MATCH edges ---
parent = {i: i for i in qs}
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for p in pairs:
    if p["label"] == "MATCH":
        parent[find(p["a"])] = find(p["b"])
comp = {}
for i in qs:
    comp.setdefault(find(i), []).append(i)
components = list(comp.values())   # each = one distinct underlying question


def comp_spec_bucket(members):
    # cluster specificity = median member specificity
    v = sorted(qs[m]["spec"] for m in members)
    return bucket(v[len(v) // 2])


# --- Phase 3: recurrence overall + stratified ---
def n_sources(members):
    return len({origin(m) for m in members})


rows = []
for members in components:
    ns = n_sources(members)
    rows.append({"size": len(members), "sources": ns, "recurs": ns >= 2,
                 "bucket": comp_spec_bucket(members), "members": members})

total = len(rows)
recur = [r for r in rows if r["recurs"]]
print(f"distinct underlying questions (components) = {total}")
print(f"recurrences (>=2 independent sources)      = {len(recur)}  "
      f"({len(recur)/total:.1%})")
print(f"sources-per-cluster: {Counter(r['sources'] for r in rows)}")
print(f"\nquestion specificity distribution: {Counter(q['bucket'] for q in qs.values())}")

print("\n=== PHASE 3: RECURRENCE vs SPECIFICITY (the goldilocks curve) ===")
print(f"{'bucket':16} {'#Qs':>4} {'#clusters':>9} {'#recurring':>10} {'recurrence%':>12}")
order = ["generic", "moderate", "specific", "hyper-specific"]
curve = {}
for b in order:
    brows = [r for r in rows if r["bucket"] == b]
    nq = sum(q["bucket"] == b for q in qs.values())
    nrec = sum(r["recurs"] for r in brows)
    rate = nrec / len(brows) if brows else None
    curve[b] = {"questions": nq, "clusters": len(brows), "recurring": nrec, "rate": rate}
    print(f"{b:16} {nq:>4} {len(brows):>9} {nrec:>10} "
          f"{(f'{rate:.1%}' if rate is not None else 'n/a'):>12}")

json.dump({"total_components": total, "recurrences": len(recur),
           "overall_rate": round(len(recur)/total, 3),
           "sources_per_cluster": dict(Counter(r["sources"] for r in rows)),
           "specificity_curve": curve,
           "cross_source_clusters": [{"members": r["members"], "sources": r["sources"],
                                      "bucket": r["bucket"]} for r in recur]},
          open(os.path.join(HERE, "reports", "recurrence.json"), "w"), indent=1)
print("\n=== sample recurring clusters by bucket (for hand spot-check) ===")
for b in order:
    ex = [r for r in recur if r["bucket"] == b][:2]
    for r in ex:
        print(f"[{b}] " + "  ||  ".join(f"{origin(m)}: {qs[m]['text'][:44]}" for m in r["members"][:3]))
