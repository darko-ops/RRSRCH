#!/usr/bin/env python3
"""Build the SPECIFIC-question equivalence eval set (traffic-hypothesis test).

Anchors: verbatim NIST SP 800-171r2 security-requirement statements (real,
multi-clause, specific), lightly question-framed ("How should an organization
{requirement}?" — a uniform frame that cancels across pair members).
  origin: NIST SP 800-171 Rev.2 §<id>  (regulatory, verbatim).

HARD NEGATIVES (NO_MATCH): two DIFFERENT real requirements from the SAME family
  (same subtopic, different specific ask) — both sides verbatim NIST → natural.

POSITIVES (MATCH): each anchor vs an AUTHORED, meaning-preserving paraphrase that
  keeps every specific element but is deliberately lexically varied (stresses the
  matcher). Flagged authored=true. This is the set's main threat (§ report).

Same schema as eval/equivalence_questions.json + equivalence_pairs.json so the
SAME scoring path (reranker_ab.score_pairs) runs unchanged.
"""
import json
import os
from itertools import combinations

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (control_id, family, verbatim requirement statement)
ANCHORS = [
    # --- SC 3.13: System & Communications Protection ---
    ("3.13.1", "SC", "monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems"),
    ("3.13.5", "SC", "implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks"),
    ("3.13.6", "SC", "deny network communications traffic by default and allow network communications traffic by exception (deny all, permit by exception)"),
    ("3.13.8", "SC", "implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards"),
    ("3.13.11", "SC", "employ FIPS-validated cryptography when used to protect the confidentiality of CUI"),
    ("3.13.16", "SC", "protect the confidentiality of CUI at rest"),
    ("3.13.9", "SC", "terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity"),
    ("3.13.12", "SC", "prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device"),
    # --- IA 3.5: Identification & Authentication ---
    ("3.5.2", "IA", "authenticate or verify the identities of users, processes, or devices as a prerequisite to allowing access to organizational systems"),
    ("3.5.3", "IA", "use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts"),
    ("3.5.7", "IA", "enforce a minimum password complexity and change of characters when new passwords are created"),
    ("3.5.8", "IA", "prohibit password reuse for a specified number of generations"),
    ("3.5.10", "IA", "store and transmit only cryptographically-protected passwords"),
    ("3.5.6", "IA", "disable identifiers after a defined period of inactivity"),
    # --- AC 3.1: Access Control ---
    ("3.1.1", "AC", "limit system access to authorized users, processes acting on behalf of authorized users, and devices including other systems"),
    ("3.1.2", "AC", "limit system access to the types of transactions and functions that authorized users are permitted to execute"),
    ("3.1.3", "AC", "control the flow of CUI in accordance with approved authorizations"),
    ("3.1.5", "AC", "employ the principle of least privilege, including for specific security functions and privileged accounts"),
    ("3.1.12", "AC", "monitor and control remote access sessions"),
    ("3.1.13", "AC", "employ cryptographic mechanisms to protect the confidentiality of remote access sessions"),
    ("3.1.20", "AC", "verify and control or limit connections to and use of external systems"),
    ("3.1.22", "AC", "control CUI posted or processed on publicly accessible systems"),
    # --- CM 3.4: Configuration Management ---
    ("3.4.1", "CM", "establish and maintain baseline configurations and inventories of organizational systems including hardware, software, firmware, and documentation throughout the system development life cycle"),
    ("3.4.2", "CM", "establish and enforce security configuration settings for information technology products employed in organizational systems"),
    ("3.4.6", "CM", "employ the principle of least functionality by configuring organizational systems to provide only essential capabilities"),
    ("3.4.7", "CM", "restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services"),
    ("3.4.8", "CM", "apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the use of authorized software"),
    ("3.4.9", "CM", "control and monitor user-installed software"),
    # --- SI 3.14: System & Information Integrity ---
    ("3.14.1", "SI", "identify, report, and correct system flaws in a timely manner"),
    ("3.14.2", "SI", "provide protection from malicious code at designated locations within organizational systems"),
    ("3.14.4", "SI", "update malicious code protection mechanisms when new releases are available"),
    ("3.14.6", "SI", "monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks"),
]

# authored, meaning-preserving, lexically-varied paraphrases (keep EVERY specific
# element). control_id -> paraphrase question (already framed).
PARAPHRASES = {
    "3.13.1": "How should a company observe, govern, and safeguard the data flowing across both its outer network perimeter and its important interior network divisions?",
    "3.13.5": "How should an org place internet-facing services onto separate network segments that are kept physically or logically apart from its internal LAN?",
    "3.13.6": "How should a firewall be set so that every packet is dropped unless a specific rule explicitly permits it (a default-deny stance)?",
    "3.13.8": "How should an organization use encryption so that CUI cannot be read while in transit, unless equivalent physical protection is already in place?",
    "3.13.11": "How should a contractor ensure any cryptography that safeguards CUI confidentiality is validated under FIPS?",
    "3.13.16": "How should an organization keep stored CUI confidential while it sits at rest?",
    "3.5.2": "How should identities of people, service processes, and hardware be verified before they are granted access to company systems?",
    "3.5.3": "How should an org require two or more authentication factors for on-site and remote sign-ins to admin accounts, and for remote sign-ins to regular user accounts?",
    "3.5.7": "How should newly created passwords be forced to meet a minimum complexity bar and to change enough characters from the prior one?",
    "3.5.8": "How should the system stop users from reusing any of their last several passwords?",
    "3.5.10": "How should passwords be handled so that only cryptographically protected forms are ever stored or sent over the wire?",
    "3.1.1": "How should access to systems be restricted to only approved people, the processes running on their behalf, and authorized equipment including other systems?",
    "3.1.2": "How should each authorized user be confined to only the specific transaction types and functions they are permitted to run?",
    "3.1.3": "How should the movement of CUI through the environment be governed strictly according to the approvals that authorize it?",
    "3.1.5": "How should the org grant each account only the minimum privileges it needs, including for security-relevant functions and administrator accounts?",
    "3.1.12": "How should remote-access sessions be watched and kept under control by the organization?",
    "3.1.13": "How should encryption be applied to keep the contents of remote-access sessions confidential?",
    "3.1.20": "How should connections to, and the use of, systems outside the organization's control be vetted and either governed or capped?",
    "3.4.1": "How should an org create and keep current a baseline build and asset inventory (hardware, software, firmware, docs) across the whole system life cycle?",
    "3.4.2": "How should hardened security configuration settings be defined and enforced for the IT products used in company systems?",
    "3.4.6": "How should systems be pared down so they expose only the capabilities that are actually essential (least functionality)?",
    "3.4.7": "How should nonessential programs, functions, network ports, protocols, and services be locked down, turned off, or blocked?",
    "3.4.8": "How should software execution be governed either by blocklisting unauthorized programs or by allowlisting only approved ones?",
    "3.14.1": "How should software and system defects be found, reported, and remediated promptly?",
    "3.14.2": "How should defenses against malware be placed at the chosen points inside the organization's systems?",
    "3.14.6": "How should the organization watch its systems and the traffic entering and leaving them to spot attacks and signs of impending attacks?",
    "3.1.22": "How should information marked CUI that is published or handled on public-facing systems be kept under control?",
    "3.13.9": "How should communication sessions have their network connections closed out when the session ends or after a set idle period?",
}


def main():
    frame = "How should an organization {}?"
    questions, qid = [], {}
    # anchors
    for i, (cid, fam, stmt) in enumerate(ANCHORS):
        _id = f"s{i:03d}"
        qid[cid] = _id
        questions.append({"id": _id, "text": frame.format(stmt),
                          "origin": f"NIST SP 800-171 Rev.2 §{cid}", "control": cid,
                          "family": fam, "kind": "anchor", "authored": False})
    # paraphrases
    pid = {}
    for j, (cid, para) in enumerate(PARAPHRASES.items()):
        _id = f"p{j:03d}"
        pid[cid] = _id
        questions.append({"id": _id, "text": para,
                          "origin": f"AUTHORED meaning-preserving paraphrase of NIST §{cid}",
                          "control": cid, "family": dict((a, f) for a, f, _ in ANCHORS)[cid],
                          "kind": "paraphrase", "authored": True})

    pairs = []
    # POSITIVES: anchor <-> its authored paraphrase
    for cid, p in pid.items():
        pairs.append({"a": qid[cid], "b": p, "label": "MATCH", "authored_positive": True,
                      "basis": f"paraphrase of NIST §{cid}", "split": "test"})
    # HARD NEGATIVES: distinct anchors within the same family
    byfam = {}
    for cid, fam, _ in ANCHORS:
        byfam.setdefault(fam, []).append(cid)
    for fam, cids in byfam.items():
        for a, b in combinations(cids, 2):
            pairs.append({"a": qid[a], "b": qid[b], "label": "NO_MATCH", "authored_positive": False,
                          "basis": f"different {fam} requirements ({a} vs {b})", "split": "test"})

    out_q = {"_note": "SPECIFIC-question equivalence set. Anchors = verbatim NIST SP "
             "800-171r2 requirement statements (real, specific, multi-clause). Positives = "
             "AUTHORED lexically-varied meaning-preserving paraphrases (flagged). Hard "
             "negatives = different real requirements from the same control family (natural).",
             "questions": questions, "total_unique": len(questions)}
    out_p = {"_note": "MATCH = anchor<->authored paraphrase (authored positives, flagged). "
             "NO_MATCH = two different real NIST requirements in the same family (natural).",
             "pairs": pairs,
             "counts": {"MATCH": sum(p["label"] == "MATCH" for p in pairs),
                        "NO_MATCH": sum(p["label"] == "NO_MATCH" for p in pairs)}}
    json.dump(out_q, open(os.path.join(HERE, "eval", "specific_questions.json"), "w"), indent=1)
    json.dump(out_p, open(os.path.join(HERE, "eval", "specific_pairs.json"), "w"), indent=1)
    fams = {f: len(c) for f, c in byfam.items()}
    print(f"anchors={len(ANCHORS)} paraphrases={len(PARAPHRASES)} "
          f"questions={len(questions)}")
    print(f"pairs: MATCH={out_p['counts']['MATCH']} (all authored) "
          f"NO_MATCH={out_p['counts']['NO_MATCH']} (all natural, same-family)")
    print(f"families: {fams}")


if __name__ == "__main__":
    main()
