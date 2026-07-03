"""The hardened corroboration gate. The verdict is code; these tests pin the two
failure modes Phase 0 had (negation false-agree, paraphrase false-disagree) plus
the extraction primitives."""
from __future__ import annotations

from rrsrch.agreement import ClaimFields, RegexExtractor, _numbers_match, verdict
from tests.conftest import offline_settings

S = offline_settings()
EX = RegexExtractor()


# --- extraction ---

def test_extracts_numbers_currency_percent_commas():
    f = EX.extract("S3 costs $0.023 per GB; egress is 5% over 1,234 GB")
    assert 0.023 in f.numbers and 5.0 in f.numbers and 1234.0 in f.numbers


def test_extracts_negation():
    assert EX.extract("Acme is not compliant with SOC 2").negated is True
    assert EX.extract("Acme is non-compliant").negated is True
    assert EX.extract("Acme fails to meet SOC 2").negated is True
    assert EX.extract("Acme is compliant with SOC 2").negated is False


def test_extracts_entities():
    f = EX.extract("NIST SP 800-171 controls are assessed by a C3PAO under CMMC")
    assert {"NIST", "C3PAO", "CMMC"} <= f.entities


# --- the deterministic comparison ---

def test_extracts_versions_separately_from_numbers():
    f = EX.extract("The latest stable Python 3 release is Python 3.14.6.")
    assert f.versions == ["3.14.6"]
    assert 3.14 not in f.numbers          # not truncated into a measurement
    f2 = EX.extract("Kubernetes 1.35.")   # one dot, but product-prefixed
    assert f2.versions == ["1.35"]
    f3 = EX.extract("$0.023 per GB-month (first 50 TB tier).")
    assert f3.versions == [] and 0.023 in f3.numbers   # prices stay numbers
    assert EX.extract("Ubuntu 26.04 LTS.").versions == ["26.04"]


def test_version_mismatch_disagrees_despite_numeric_tolerance():
    """THE proof-of-search hole: 3.14.5 vs 3.14.6 truncated to identical 3.14,
    and 1.34 vs 1.35 sits inside the 1% price tolerance. Versions are ordinal —
    exact or a different fact."""
    v = verdict("Python 3.14.6, released June 10, 2026.", "Python 3.14.5.", EX, S)
    assert v.agree is False and v.rule == "version_mismatch"
    v2 = verdict("Kubernetes 1.35.", "Kubernetes 1.34.", EX, S)
    assert v2.agree is False and v2.rule == "version_mismatch"


def test_version_match_agrees_exactly():
    v = verdict("The newest stable release is Python 3.14.6.",
                "Python 3.14.6 is the latest stable version.", EX, S)
    assert v.agree is True and v.rule == "version_match"


def test_numbers_match_within_tolerance_and_subset():
    assert _numbers_match([0.023], [0.023], 0.01)
    assert _numbers_match([100.0], [100.9], 0.01)            # within 1%
    assert not _numbers_match([0.023], [0.021], 0.01)
    assert _numbers_match([110.0], [110.0, 2026.0], 0.01)    # extra context number ok
    assert not _numbers_match([0.023], [2026.0], 0.01)


# --- verdicts: the two Phase 0 failure modes ---

def test_negation_flips_to_disagreement_despite_high_lexical():
    v = verdict("Acme Corp is not compliant with SOC 2",
                "Acme Corp is compliant with SOC 2", EX, S)
    assert v.agree is False and v.rule == "polarity_mismatch"
    assert v.lexical > 0.7   # exactly the case the lexical gate got wrong


def test_paraphrase_with_matching_numbers_agrees_despite_low_lexical():
    v = verdict("A C3PAO assesses the 110 controls of NIST 800-171 for CMMC Level 2",
                "CMMC Level 2 requires the 110 NIST 800-171 controls, assessed by a C3PAO",
                EX, S)
    assert v.agree is True and v.rule == "numeric_match"
    assert v.lexical < S.claim_agreement_threshold   # Phase 0 would have false-disagreed


def test_numeric_mismatch_disagrees():
    v = verdict("$0.021 per GB-month (reduced January 2026)", "$0.023 per GB-month", EX, S)
    assert v.agree is False and v.rule == "numeric_mismatch"


def test_entity_match_agrees_on_number_free_paraphrase():
    v = verdict("Terraform state should live in an S3 backend with DynamoDB locking",
                "Use an S3 backend plus DynamoDB locking for Terraform state", EX, S)
    assert v.agree is True and v.rule == "entity_match"


def test_lexical_fallback_when_nothing_extracted():
    agree = verdict("rotate the key then delete the old one",
                    "rotate the key then delete the old one", EX, S)
    assert agree.agree is True and agree.rule == "lexical_match"
    disagree = verdict("completely different new answer", "old answer", EX, S)
    assert disagree.agree is False and disagree.rule == "lexical_low"


# -------- scoped effective polarity: the double-negation poison bypass --------

def test_attack_sentential_negation_of_negated_truth_disagrees():
    """THE bypass: the truth is itself negation-phrased, so a boolean 'negated'
    saturates and the poison superset lexically agrees. Effective polarity
    separates them: {neg} vs {pos}."""
    v = verdict("Not true: HIPAA does not require encryption at rest",
                "HIPAA does not require encryption at rest", EX, S)
    assert v.agree is False and v.rule == "polarity_mismatch"
    v2 = verdict("It is false that MFA is not mandatory for contractors",
                 "MFA is not mandatory for contractors", EX, S)
    assert v2.agree is False and v2.rule == "polarity_mismatch"
    v3 = verdict("That is wrong: the pentest is not required annually",
                 "The pentest is not required annually", EX, S)
    assert v3.agree is False and v3.rule == "polarity_mismatch"


def test_nonmisfire_conjunction_of_independent_negations_agrees():
    """Scoped, not counted: two negations in DIFFERENT clauses are independent —
    global parity would call this even (= positive) and misfire."""
    v = verdict("The scan is not required and the pentest is not mandatory",
                "The pentest is not mandatory and the scan is not required", EX, S)
    assert v.agree is True
    f = EX.extract("The scan is not required and the pentest is not mandatory")
    assert f.polarity == frozenset({"neg"})   # NOT flipped to positive


def test_nonmisfire_single_negation_paraphrase_agrees():
    v = verdict("Encryption at rest is not required",
                "Encryption at rest is not mandated", EX, S)
    assert v.agree is True


def test_regression_original_negation_safety_still_holds():
    v = verdict("The audit is not required for Level 1",
                "The audit is required for Level 1", EX, S)
    assert v.agree is False and v.rule == "polarity_mismatch"


def test_stretch_net_affirmative_double_negation_matches_affirmative():
    f = EX.extract("It is not untrue that the audit is required")
    assert f.polarity == frozenset({"pos"})   # not ⊕ untrue = affirmative
    # with a decisive comparand the net-affirmative wrapper matches the plain
    # affirmative (numeric rule); pure-prose rewrites still fall to the
    # conservative lexical fallback by design.
    v = verdict("It is not untrue that all 110 controls are required",
                "All 110 controls are required", EX, S)
    assert v.agree is True and v.rule == "numeric_match"


def test_intent_guard_uses_the_same_effective_polarity():
    from rrsrch.agreement import intent_verdict
    q = EX.extract("Is it not true that HIPAA does not require encryption?")
    c = EX.extract("Does HIPAA not require encryption at rest?")
    # query is a double-negation (asks the AFFIRMATIVE); candidate is single-neg
    iv = intent_verdict(q, c)
    assert iv.match is False and iv.rule == "polarity_flip"


def test_verdict_detail_is_auditable():
    v = verdict("$5 fee", "$7 fee", EX, S)
    assert v.detail["new"]["numbers"] == [5.0] and v.detail["old"]["numbers"] == [7.0]
    assert isinstance(ClaimFields().to_log(), dict)
