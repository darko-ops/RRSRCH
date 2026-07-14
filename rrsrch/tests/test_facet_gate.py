"""Interrogative-facet gate (agreement.py): reject cross-facet serves, preserve
same-facet paraphrases. Pinned against the captured Phase-A hits so the gate can't
regress into over-gating (killing the 7 true hits) or overfit to the 5 false ones.
"""
from rrsrch.agreement import RegexExtractor, _extract_facet, intent_verdict

EX = RegexExtractor()


def _match(q: str, c: str) -> bool:
    return intent_verdict(EX.extract(q), EX.extract(c)).match


# --- extraction / normalization -------------------------------------------------

def test_facet_normalizes_synonyms():
    assert _extract_facet("how much does CMMC cost?") == "cost"
    assert _extract_facet("what's the price of certification?") == "cost"
    assert _extract_facet("how long does the assessment take?") == "duration"
    assert _extract_facet("how long is the certification valid?") == "duration"
    assert _extract_facet("who needs to comply?") == "who"
    assert _extract_facet("what's the deadline?") == "when"
    assert _extract_facet("how do I get certified?") == "how-to"
    assert _extract_facet("how many controls are there?") == "quantity"


def test_descriptive_questions_have_no_facet():
    # what-is / why / whether / difference / what-happens ⇒ undetermined (no gate)
    for q in ("What is CUI?", "Why is CMMC needed?", "Do we need a C3PAO?",
              "What is the difference between DFARS and CMMC?",
              "What happens if we don't comply?"):
        assert _extract_facet(q) is None, q


# --- OVER-GATING GUARD: same-facet paraphrases MUST still match -----------------

def test_pinned_same_facet_duration_paraphrase_still_matches():
    assert _match("how long does certification take?",
                  "what is the duration of certification?")


# The 7 TRUE hits from reports/organic.md §5 — every one must survive the gate.
TRUE_PAIRS = [
    ("Do we need a C3PAO assessment or is a self-assessment enough?",
     "Do I need to undergo a Level 2 assessment with a C3PAO, or can I conduct a self-assessment?"),
    ("What Is the CMMC Required by the DoD?", "What is the purpose of CMMC?"),
    ("What are the penalties for CMMC non-compliance?",
     "What happens if we don't meet CMMC Compliance requirements?"),
    ("How long does the CMMC compliance process take?",
     "How long does a CMMC Level 2 assessment generally take?"),
    ("Why Is There a Need to Create the CMMC?", "What is the purpose of CMMC?"),
    ("What Is the Difference Between DFARS and CMMC?",
     "Why Is the DoD Switching from DFARS Compliance to CMMC?"),
    ("How Do You Get CMMC Certification?", "How do I get CMMC certified?"),
]


def test_all_seven_true_hits_preserved():
    for q, c in TRUE_PAIRS:
        assert _match(q, c), f"OVER-GATED true hit: {q!r} vs {c!r}"


# --- the false hits the gate is meant to kill (4 of 5) --------------------------

FALSE_PAIRS_KILLED = [
    ("What's the deadline to get CMMC compliant?", "Who needs to comply with CMMC?"),
    ("What should we do now to prepare for CMMC compliance?", "Who needs to comply with CMMC?"),
    ("How long is my CMMC certification valid?", "How do I get CMMC certified?"),
    ("How Long Is the Validity of CMMC Certification?", "How do I get CMMC certified?"),
]


def test_cross_facet_false_hits_rejected():
    for q, c in FALSE_PAIRS_KILLED:
        assert not _match(q, c), f"gate FAILED to reject: {q!r} vs {c!r}"


def test_documented_limitation_enclave_vs_cui_survives():
    # A SUBJECT mismatch (enclave vs CUI), not a facet one — both are 'what-is',
    # so the facet gate correctly does NOT fire. Honest limitation, not overfit:
    # this needs the entity/subject axis, not a new facet.
    assert _match("What is a CUI enclave?", "What is CUI?")


def test_facet_reject_beats_high_polarity_agreement():
    # both positive polarity, no predicate axes — only the facet differs.
    v = intent_verdict(EX.extract("when is the deadline?"), EX.extract("who must comply?"))
    assert not v.match and v.rule.startswith("facet_mismatch")
