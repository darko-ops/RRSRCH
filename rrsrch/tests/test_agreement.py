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


def test_verdict_detail_is_auditable():
    v = verdict("$5 fee", "$7 fee", EX, S)
    assert v.detail["new"]["numbers"] == [5.0] and v.detail["old"]["numbers"] == [7.0]
    assert isinstance(ClaimFields().to_log(), dict)
