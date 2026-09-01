"""Agreement — the corroboration verdict, hardened.

=============================================================================
THE INVIOLABLE RULE: the agreement/disagreement VERDICT is DETERMINISTIC,
auditable code. An LLM MAY implement the Extractor protocol (proposing
numbers/dates/entities/polarity from a claim — a fuzzy, recoverable task),
but the comparison of those fields and the final verdict happen HERE, in
plain code, and both the fields and the rule that fired are logged so every
verdict is auditable after the fact.
=============================================================================

Phase 0's gate (lexical similarity >= 0.90) had two real failure modes:
  - false DISAGREE on correct paraphrases ("110 controls assessed by a C3PAO"
    vs "a C3PAO assesses the 110 controls"),
  - false AGREE across a negation ("X is compliant" vs "X is not compliant"
    are lexically near-identical).

The fix: extract structured comparands, then decide deterministically:
  0. contested substitution                  → DISAGREE (near-verbatim claims
                                               that differ ONLY by swapped
                                               content words — see below)
  1. polarity differs                        → DISAGREE (negation safety)
  2. both have versions, any unmatched       → DISAGREE (versions are ORDINAL:
                                               exact compare, never tolerance —
                                               3.14.5 vs 3.14.6 is a new fact)
  3. both have numbers, any unmatched        → DISAGREE (numbers are load-bearing;
                                               1% tolerance for measurements)
  4. versions / numbers all matched          → AGREE    (paraphrase safety)
  5. both have entities, strong overlap      → AGREE (needs moderate lexical too)
  6. nothing extracted on either side        → Phase 0 lexical fallback

The CONTESTED-SUBSTITUTION guard (rule 0) closes a hole in rules 4-5: two
claims sharing incidental numbers or entities but contradicting in one aligned
content word ("the sky is plaid, variant 0" vs "the sky is blue, variant 0")
short-circuited to AGREE via numeric_match — a false agree that wrongly
re-earns confidence. A lexical floor cannot separate this (the contested pair
scores 0.67, ABOVE genuine reworded paraphrases at ~0.6); the discriminator is
SHAPE: identical token count, at most two differing positions, and a differing
position where both tokens are non-stopword words with different stems. Real
paraphrases reword everywhere (many position diffs) and stay untouched; a
pointed edit in a near-verbatim claim is exactly the contested case. Asymmetric
risk, per the corroboration doctrine: a false disagree merely supersedes with
an equivalent-truth claim (recoverable); a false agree vouches a lie.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from .matching.lexical import lexical_score


@dataclass
class ClaimFields:
    """Structured comparands proposed by an Extractor (regex here; an LLM may
    implement the same protocol — it proposes, code decides).

    `predicates` maps an antonym AXIS to a direction (+1/-1), e.g.
    "enable X" → {"activation": +1}, "disable X" → {"activation": -1}. A text
    containing BOTH poles of an axis is ambiguous — the axis is dropped.

    `versions` are dotted release identifiers ("3.14.6", "Kubernetes 1.35") —
    ORDINAL, not measurements: they compare EXACTLY, never within tolerance
    (3.14.5 vs 3.14.6 is a different fact; 1.34 vs 1.35 is 0.75% apart and the
    numeric tolerance would falsely agree). Kept separate from `numbers`.

    `polarity` is the set of per-clause EFFECTIVE polarities ("pos"/"neg") —
    scoped, not counted: within a clause, local negations XOR sentential
    truth-value wrappers ("Not true: …"); across clause boundaries negations
    are independent and never cancel. A document-level boolean saturates on
    double negation ("Not true: X is not required" MEANS the opposite of
    "X is not required" but both contain 'not') — the poison bypass this
    field closes."""
    numbers: list[float] = field(default_factory=list)
    entities: set[str] = field(default_factory=set)
    predicates: dict[str, int] = field(default_factory=dict)
    versions: list[str] = field(default_factory=list)
    polarity: frozenset[str] = frozenset({"pos"})
    # Interrogative FACET: the KIND of answer a QUESTION asks for (a party / a
    # date / a timespan / a cost / a count / a procedure). None = undetermined
    # (descriptive what-is/why/whether questions) — no signal, no gate. Only
    # meaningful on queries; a statement claim rarely carries one and it is
    # never consulted by the corroboration verdict, only by the serve-path
    # intent guard (query-vs-query). See _extract_facet.
    facet: str | None = None

    @property
    def negated(self) -> bool:
        """Legacy view: purely-negative polarity. Verdicts compare the full
        polarity SET; this exists for audit readability and older call sites."""
        return self.polarity == frozenset({"neg"})

    def to_log(self) -> dict[str, Any]:
        return {"numbers": self.numbers, "entities": sorted(self.entities),
                "polarity": sorted(self.polarity), "predicates": self.predicates,
                "versions": self.versions, "facet": self.facet}


class Extractor(Protocol):
    def extract(self, claim: str) -> ClaimFields: ...


_NUM = re.compile(r"(?<![\w.])[$€£]?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?%?")
# dotted release identifiers: "3.14.6", "1.35", "26.04" — never $-prefixed,
# never %-suffixed (those are measurements and stay in `numbers`).
_VER = re.compile(r"(?<![\w.$€£])(\d+(?:\.\d+)+)(?![\d%])")
# single-dot numerics ("1.35") are versions only in version CONTEXT: preceded by
# a capitalized product token (Kubernetes 1.35, TLS 1.2) or a marker word.
# Two-plus dots ("3.14.6") are always versions. Plain decimals ("0.023 per GB")
# stay numbers so price tolerance keeps working.
_VER_MARKERS = {"version", "versions", "release", "releases", "lts", "v", "minor",
                "major", "req"}


def _is_version(text: str, m: "re.Match[str]") -> bool:
    if m.group(1).count(".") >= 2:
        return True
    before = text[:m.start()].rstrip()
    prev = re.findall(r"[A-Za-z][\w.&-]*", before)
    if not prev:
        return False
    tok = prev[-1].rstrip(".")
    return tok.lower() in _VER_MARKERS or tok[:1].isupper()
# LOCAL negation markers: negate the predicate/clause they sit in
# ("does not require", "non-compliant") — scoped to their clause.
_NEG = re.compile(
    r"\b(not|no longer|never|none|cannot|can't|won't|isn't|aren't|wasn't|weren't|"
    r"doesn't|don't|didn't|fails?\s+to|non)[-\s]", re.IGNORECASE)
# SENTENTIAL (meta) negation: a truth-value wrapper that negates the WHOLE
# proposition it scopes over. Deliberately a tight phrase lexicon — every entry
# flips a polarity, and a wrong flip biases toward DISAGREE (recoverable).
_SENTENTIAL = re.compile(
    r"\b(not true|untrue|not correct|incorrect|not accurate|not the case|"
    r"false that|it is false|mistaken that|wrong that|that is wrong)\b",
    re.IGNORECASE)
# clause boundaries = the independence anchor: negations in different clauses
# govern different predicates and never cancel into a false double negation.
_CLAUSE = re.compile(r"[.;!?]|\band\b|\bbut\b|\bwhile\b|\bwhereas\b", re.IGNORECASE)


def _clause_polarity(text: str) -> frozenset[str]:
    """Per-clause effective polarity: local-negation parity XOR sentential-
    wrapper parity, computed WITHIN each clause. Scoped, not counted — the
    conjunction "X is not A and Y is not B" yields {neg} (two independent
    negatives), while "Not true: X is not A" yields {pos} (a genuine double
    negation of one proposition)."""
    out: set[str] = set()
    for clause in _CLAUSE.split(text or ""):
        if not clause.strip():
            continue
        sentential = len(_SENTENTIAL.findall(clause))
        remainder = _SENTENTIAL.sub(" ", clause)     # don't double-count "not true"
        local = len(_NEG.findall(remainder + " "))
        out.add("neg" if (local + sentential) % 2 else "pos")
    return frozenset(out) if out else frozenset({"pos"})
# entities: ALL-CAPS acronyms (NIST, C3PAO) and TitleCase tokens of length >= 3
_ENT = re.compile(r"\b([A-Z][A-Z0-9-]{1,}|[A-Z][a-z]{2,})\b")
_ENT_STOP = {"The", "This", "That", "These", "Those", "For", "And", "But", "Its",
             "Are", "Was", "Has", "Have", "Will", "With", "From", "Most", "Some"}

# Antonym predicate axes: base form → (axis, direction). Opposite directions on
# the SAME axis flip intent ("enable X" vs "disable X"); same direction or a
# missing side is NOT a flip. Kept deliberately tight — every entry here can
# reject a serve, and a false reject only costs a fresh search.
_PREDICATE_AXES: dict[str, tuple[str, int]] = {
    "require": ("obligation", 1), "mandate": ("obligation", 1), "must": ("obligation", 1),
    "prohibit": ("obligation", -1), "forbid": ("obligation", -1), "ban": ("obligation", -1),
    "disallow": ("obligation", -1),
    "enable": ("activation", 1), "activate": ("activation", 1),
    "disable": ("activation", -1), "deactivate": ("activation", -1),
    "install": ("installation", 1),
    "uninstall": ("installation", -1), "remove": ("installation", -1),
    "delete": ("installation", -1),
    "increase": ("direction", 1), "raise": ("direction", 1), "grow": ("direction", 1),
    "boost": ("direction", 1),
    "decrease": ("direction", -1), "reduce": ("direction", -1), "lower": ("direction", -1),
    "shrink": ("direction", -1),
    "allow": ("permission", 1), "permit": ("permission", 1), "grant": ("permission", 1),
    "deny": ("permission", -1), "block": ("permission", -1), "revoke": ("permission", -1),
    "include": ("inclusion", 1),
    "exclude": ("inclusion", -1), "omit": ("inclusion", -1),
    "before": ("order", 1), "after": ("order", -1),
}
_WORD = re.compile(r"[a-z]+")


def _stems(token: str):
    """Deterministic suffix stripping — 'requires'→'require', 'installing'→
    'install', 'increased'→'increase', 'banned'→'ban'. NOT a stemmer: it only
    generates candidates; the tight lexicon does the filtering (so
    'requirements' matches nothing — no signal, not a wrong signal)."""
    yield token
    for suffix in ("s", "d", "es", "ed", "ing"):
        if token.endswith(suffix) and len(token) - len(suffix) >= 3:
            stem = token[: -len(suffix)]
            yield stem
            if suffix in ("ed", "ing"):
                if len(stem) >= 4 and stem[-1] == stem[-2]:
                    yield stem[:-1]          # banned → bann → ban
                yield stem + "e"             # increasing → increas → increase


def _extract_predicates(text: str) -> dict[str, int]:
    directions: dict[str, set[int]] = {}
    for tok in _WORD.findall((text or "").lower()):
        for stem in _stems(tok):
            if stem in _PREDICATE_AXES:
                axis, sign = _PREDICATE_AXES[stem]
                directions.setdefault(axis, set()).add(sign)
                break
    # both poles present ⇒ ambiguous ⇒ no signal for that axis
    return {axis: signs.pop() for axis, signs in directions.items() if len(signs) == 1}


# Interrogative FACET cues. Cosine embeds "what's the deadline" and "who must
# comply" as near as paraphrases, but they ask for a DATE vs a PARTY. Only sharp,
# PARAMETRIC answer-shapes get a facet — a party / a date / a timespan / a money
# amount / a count / a procedure. Descriptive questions (what-is, why, whether,
# difference, what-happens) deliberately get NO facet: they are the fuzzy majority
# and gating them would falsely reject genuine cross-wording paraphrases ("why
# need CMMC" ~ "what is the purpose of CMMC"). Tight by design — like the scope
# gazetteer, every entry can veto a serve and a false veto only costs a fresh
# search. Ordered: specific "how much/long/many" win over the generic how-to.
_FACET_CUES: list[tuple[str, "re.Pattern[str]"]] = [
    ("cost",     re.compile(r"\bhow much\b|\bcosts?\b|\bpriced?\b|\bpricing\b|\bfees?\b", re.I)),
    ("quantity", re.compile(r"\bhow many\b", re.I)),
    ("duration", re.compile(r"\bhow long\b|\bduration\b", re.I)),
    ("when",     re.compile(r"\bwhen\b|\bdeadline\b|\bdue date\b|\bby when\b", re.I)),
    ("who",      re.compile(r"\bwho\b|\bwhom\b", re.I)),
    ("how-to",   re.compile(r"\bhow (do|does|to|can|should|would|will)\b|"
                            r"\bwhat should\b|\bwhat steps\b|\bhow-to\b", re.I)),
]


def _extract_facet(text: str) -> str | None:
    """The interrogative facet, or None if undetermined (no gate). First cue
    wins; synonyms normalize ('how much'→cost, 'how long'→duration)."""
    for facet, pat in _FACET_CUES:
        if pat.search(text or ""):
            return facet
    return None


class RegexExtractor:
    """Deterministic, offline extractor. Best-effort precision; determinism is
    the requirement, the verdict logic is designed to be safe when extraction
    is imperfect (unextracted claims fall back to the lexical gate)."""

    def extract(self, claim: str) -> ClaimFields:
        text = claim or ""
        versions: list[str] = []
        spans: list[tuple[int, int]] = []
        for m in _VER.finditer(text):
            if _is_version(text, m):
                versions.append(m.group(1))
                spans.append(m.span())
        numbers = [float((m.group(1) + (m.group(2) or "")).replace(",", ""))
                   for m in _NUM.finditer(text)
                   # a version's components are not measurements — don't let the
                   # number regex truncate "3.14.6" into 3.14
                   if not any(a <= m.start() < b for a, b in spans)]
        entities = {m.group(1) for m in _ENT.finditer(text)} - _ENT_STOP
        return ClaimFields(numbers=numbers, entities=entities,
                           polarity=_clause_polarity(text),
                           predicates=_extract_predicates(text), versions=versions,
                           facet=_extract_facet(text))


@dataclass
class Verdict:
    agree: bool
    rule: str                 # which deterministic rule decided
    lexical: float
    detail: dict[str, Any]    # both sides' fields — the audit trail


# stopwords + copulas never count as a contested substitution ("a" vs "the",
# "is" vs "was" are wording, not content).
_SUBST_STOP = {"a", "an", "the", "this", "that", "these", "those", "is", "are",
               "was", "were", "be", "been", "being", "of", "in", "on", "at",
               "to", "for", "and", "or", "but", "as", "by", "with", "from",
               "per", "it", "its", "their", "your", "our"}
_SUBST_TOKEN = re.compile(r"[\w$€£%.#+-]+")
_MAX_SUBST_DIFFS = 2


def _axis_sign(token: str) -> tuple[str, int] | None:
    for stem in _stems(token):
        if stem in _PREDICATE_AXES:
            return _PREDICATE_AXES[stem]
    return None


def _contested_substitution(new_claim: str, old_claim: str) -> str | None:
    """Detect a pointed content-word swap between NEAR-VERBATIM claims: same
    token count, <= _MAX_SUBST_DIFFS differing positions, and some differing
    position where both tokens are alphabetic non-stopwords with no shared stem
    (shared stems absolve inflection: 'assesses' vs 'assessed'; a shared
    predicate axis with the SAME sign absolves known synonyms: 'required' vs
    'mandated' are both obligation:+1 — opposite signs stay contested).
    Returns the contested pair for the audit trail, or None. Deliberately
    TIGHT: genuinely reworded paraphrases differ at many positions and never
    trip this."""
    a = _SUBST_TOKEN.findall((new_claim or "").lower())
    b = _SUBST_TOKEN.findall((old_claim or "").lower())
    if not a or len(a) != len(b):
        return None
    diffs = [(x, y) for x, y in zip(a, b) if x != y]
    if not diffs or len(diffs) > _MAX_SUBST_DIFFS:
        return None
    for x, y in diffs:
        # the token pattern keeps '.' (versions "3.14.6", prices "$0.023"), so a
        # SENTENCE-FINAL word arrives as "optional." — strip enclosing dots
        # before the content-word test or the last word of a claim is never
        # contestable. Interior dots survive, so versions stay intact.
        x, y = x.strip("."), y.strip(".")
        if (x in _SUBST_STOP or y in _SUBST_STOP
                or not (x.isalpha() and y.isalpha())
                or set(_stems(x)) & set(_stems(y))):
            continue
        ax, ay = _axis_sign(x), _axis_sign(y)
        if ax is not None and ax == ay:
            continue                     # same-direction predicate synonyms
        return f"{x}!={y}"
    return None


def _numbers_match(a: list[float], b: list[float], tolerance: float) -> bool:
    """Every number in the SHORTER list must have a within-tolerance counterpart
    in the longer (a claim may add context numbers like a year). Greedy 1:1."""
    short, long_ = (a, list(b)) if len(a) <= len(b) else (b, list(a))
    for x in short:
        hit = next((y for y in long_
                    if abs(x - y) <= tolerance * max(abs(x), abs(y), 1e-9)), None)
        if hit is None:
            return False
        long_.remove(hit)
    return True


def _versions_match(a: list[str], b: list[str]) -> bool:
    """Versions compare EXACTLY — no tolerance, ever. Subset rule as for numbers
    (a claim may mention an extra version, e.g. '3.14.6 and 3.13.14')."""
    short, long_ = (a, list(b)) if len(a) <= len(b) else (b, list(a))
    for v in short:
        if v not in long_:
            return False
        long_.remove(v)
    return True


def verdict(new_claim: str, old_claim: str, extractor: Extractor, settings) -> Verdict:
    """The deterministic corroboration verdict. Order matters: safety rules
    (polarity, numeric mismatch) fire before any agreement rule."""
    a = extractor.extract(new_claim)
    b = extractor.extract(old_claim)
    lex = lexical_score(new_claim, old_claim)
    detail = {"new": a.to_log(), "old": b.to_log()}

    # rule 0 — a pointed content-word swap between near-verbatim claims is a
    # CONTRADICTION, not a paraphrase: no shared number, entity, or high
    # lexical score may vouch across it. Fires before the agree shortcuts;
    # the specific mismatch rules below still take precedence in audit terms
    # only when polarity/versions/numbers themselves differ.
    contested = _contested_substitution(new_claim, old_claim)
    if contested:
        detail["contested"] = contested

    # EFFECTIVE polarity sets, not a raw boolean: "Not true: X is not required"
    # is {pos} and no longer matches "X is not required" {neg} — the
    # double-negation poison bypass. Mixed sets ({pos,neg} vs {neg}) differ →
    # conservative disagree (a false disagree just re-derives).
    if a.polarity != b.polarity:
        return Verdict(False, "polarity_mismatch", lex, detail)

    # versions are ordinal: exact or different fact — the price tolerance below
    # must never blur 3.14.5 into 3.14.6 (the proof-of-search hole).
    if a.versions and b.versions and not _versions_match(a.versions, b.versions):
        return Verdict(False, "version_mismatch", lex, detail)

    if a.numbers and b.numbers and not _numbers_match(
            a.numbers, b.numbers, settings.numeric_tolerance):
        return Verdict(False, "numeric_mismatch", lex, detail)

    # a contested substitution blocks EVERY agreement rule — matched numbers,
    # shared entities, and even near-identical wording are exactly what a
    # one-word lie looks like.
    if contested:
        return Verdict(False, "contested_substitution", lex, detail)

    if a.versions and b.versions:
        return Verdict(True, "version_match", lex, detail)
    if a.numbers and b.numbers:
        return Verdict(True, "numeric_match", lex, detail)

    if a.entities and b.entities:
        overlap = len(a.entities & b.entities) / min(len(a.entities), len(b.entities))
        if (overlap >= settings.entity_overlap_threshold
                and lex >= settings.entity_lexical_floor):
            return Verdict(True, "entity_match", lex, detail)

    # nothing decisive extracted → Phase 0 behavior: conservative lexical gate
    if lex >= settings.claim_agreement_threshold:
        return Verdict(True, "lexical_match", lex, detail)
    return Verdict(False, "lexical_low", lex, detail)


# --------------------------------------------------------------- intent guard

@dataclass
class IntentVerdict:
    match: bool
    rule: str                 # 'polarity_flip' | 'predicate_flip:<axis>' |
    detail: dict[str, Any]    # 'intent_aligned' | 'no_signal'


def intent_verdict(query_fields: ClaimFields, candidate_fields: ClaimFields,
                   *, facet_gate: bool = True) -> IntentVerdict:
    """The serve-path intent guard: does the incoming QUERY ask the same-direction
    question as the candidate deposit's canonical query?

    DETERMINISTIC, and asymmetric by design: a false hit serves a WRONG answer
    (correctness failure); a false miss just triggers a fresh search (a cost,
    recoverable). So any polarity flip or opposite-pole predicate on a shared
    axis rejects — even at embedding similarity 0.97. But ambiguity is NOT
    mismatch: if neither side yields a clear signal, similarity alone decides
    (the same fallback philosophy as the corroboration gate).

    Uses the ONE shared Extractor's fields — there is no second extraction path.
    """
    detail = {"query": query_fields.to_log(), "candidate": candidate_fields.to_log()}
    # same EFFECTIVE polarity comparison as the corroboration verdict — one
    # shared extractor, one polarity model, no divergent logic. A false miss
    # here just re-searches, so set inequality rejecting is the safe direction.
    if query_fields.polarity != candidate_fields.polarity:
        return IntentVerdict(False, "polarity_flip", detail)
    shared = sorted(set(query_fields.predicates) & set(candidate_fields.predicates))
    for axis in shared:
        if query_fields.predicates[axis] != candidate_fields.predicates[axis]:
            return IntentVerdict(False, f"predicate_flip:{axis}", detail)
    # FACET gate: the query asks for a KIND of answer (a party / date / timespan /
    # cost / count / procedure). Both sides determined and DIFFERENT ⇒ the
    # candidate answers a different question-shape on the same topic — reject even
    # at similarity 0.97, exactly like an implicit-scope conflict. Undetermined on
    # either side ⇒ no facet signal (descriptive questions paraphrase freely).
    if (facet_gate and query_fields.facet and candidate_fields.facet
            and query_fields.facet != candidate_fields.facet):
        return IntentVerdict(
            False, f"facet_mismatch:{query_fields.facet}!={candidate_fields.facet}", detail)
    # a matching determined facet is itself an alignment signal (like shared predicates)
    aligned_facet = query_fields.facet is not None and candidate_fields.facet is not None
    if shared or query_fields.negated or aligned_facet:
        return IntentVerdict(True, "intent_aligned", detail)
    return IntentVerdict(True, "no_signal", detail)
