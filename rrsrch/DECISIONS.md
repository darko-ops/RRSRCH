# DECISIONS — rrsrch Phases 0+1

Choices made where the spec left room. Phase 1 additions at the bottom.

## Scope (what this build is, and isn't)
- Phase 0 per the spec: three tools (`search`, `deposit`, `corroborate`), hybrid
  matching, deterministic confidence (decay + corroboration re-earning), telemetry,
  eval, the three worked examples end-to-end. **Excluded as later-phase scope:**
  exploration/gradient scheduler, attestation, multi-agent auth, multi-tenancy, web UI.
- *(Reversed from an earlier draft of this file: corroboration was initially cut as
  "scope creep", but the spec's core thesis — confidence "re-earned by corroboration",
  worked example C — requires it. It is now in.)*

## Confidence (the trust engine)
- One pure module, `confidence.py` — no LLM, no store, no network (the INVIOLABLE
  RULE is commented at the top of it and of `corpus.py`).
- `confidence = 0.5 ** (age_since_anchor / half_life(volatility))` where
  `anchor = last_corroborated_at or created_at`. An agreeing corroboration moves the
  anchor to now → confidence re-earned to 1.0 and decaying afresh. A corroboration
  timestamp before `created_at` is ignored (never trust an impossible anchor).
- Serve iff `confidence >= confidence_threshold` (default **0.70**, per the spec's
  worked examples). Half-lives: low 180d, medium 3d, high 6h (all env-tunable).

## Corroboration
- **Deterministic agreement gate:** lexical similarity (trigram+token Jaccard) of the
  two claims vs `claim_agreement_threshold` (default 0.90). No LLM judges agreement.
- **Asymmetric risk drives the threshold:** a false "agreed" wrongly re-earns
  confidence for a possibly-wrong claim; a false "disagreed" merely replaces it with
  the fresh claim — recoverable. So the gate errs toward disagreement (0.90 is high:
  near-verbatim claims agree; "$0.023" vs "$0.021" disagree).
- **Disagreed → supersede, never edit:** old deposit gets `retired_at` +
  `superseded_by`; a new deposit is created (reusing the stored query embedding —
  same query text, re-encoding would be waste). Retired deposits are filtered out of
  the candidate pool at the store level, so the error cannot be served again. The
  full chain stays in the DB for audit.
- Agreed also merges the corroborator's sources into the deposit (more citations).

## Matching (the deliverable)
- **Retrieval/ranking split:** the store returns a candidate *pool* (lexical kNN ∪
  vector kNN over live deposits); the engine applies the scope gate, fuses, and
  thresholds. In-memory and Postgres stores stay interchangeable behind one `Store`.
- **Scope is a hard gate before similarity** (`matching/scope.py`): any conflict on a
  shared scope key rejects the candidate outright. A false hit (right answer, wrong
  question) is worse than a miss.
- **Fusion:** `vector_weight·cosine + lexical_weight·lexical` (defaults 0.7 / 0.3).
- **Conservative threshold:** default 0.85 (MiniLM); 0.42 for the hash embedder
  (offline eval), 0.55 in tests — each tuned so false-hits stay at zero.

## Performance decisions
- **Embedding off the event loop:** `encode()` (model inference) runs via
  `asyncio.to_thread` so one search doesn't stall every other in-flight request.
- **Concurrent hybrid retrieval:** the Postgres vector kNN and trigram kNN queries
  are independent and run under `asyncio.gather` on separate pooled connections.
- **Metrics aggregate in SQL** (GROUP BY / SUM) — `/metrics` never pulls event rows
  into Python. The in-memory store mirrors the same `event_stats()` contract.
- **Top-k without full sorts:** the in-memory pool uses `heapq.nlargest` (O(n log k)).
- **Embedding reuse on supersede:** a disagreed corroboration keeps the old query's
  embedding for the replacement deposit (identical query text).
- **Partial index on live deposits** (`WHERE retired_at IS NULL`) since every
  retrieval filters on it.

## Telemetry semantics
- Outcomes: `hit` (served), `stale` (known question, decayed confidence — caller
  should corroborate), `miss` (unknown). Stale/miss are charged the cold-path
  estimate; hits are charged the served claim+sources size (tiktoken).
- Corroborations (`agreed`/`disagreed`) are logged but not counted as queries.

## Embeddings / offline operating point
- Pluggable `Embedder`: `local` (sentence-transformers, default/production), `hash`
  (deterministic char-n-gram, offline), `api` (hosted).
- **Why a hash embedder exists:** tests/eval run with no model download and no
  Postgres; it satisfies the same interface as MiniLM, so the logic under test is
  identical. Its 86.7% paraphrase rate is a FLOOR — MiniLM bridges the
  synonym/acronym gaps the hash misses.

## Testing
- `pytest-asyncio` in auto mode; every store/corpus test is a native `async def`.
- Controllable clock (`now` injected into `Corpus`) simulates age — worked example C
  deposits a claim "60 days old" without waiting.
- `tests/test_end_to_end.py` is the acceptance suite: the spec's three worked
  examples (cold miss / warm hit / stale correction) run against the full stack.
- `ruff check` + `mypy src` are clean (`make lint`).

---

# Phase 1 — Proof-of-Search

## Topics (deterministic clustering)
- **Leader clustering, frozen centroids:** exact normalized-scope partition first,
  then cosine ≥ `topic_similarity_threshold` against existing centroids; the first
  deposit that opens a topic donates its embedding as the centroid *permanently*.
  No random init, no drift; ties break on topic_id (total order). Topic ids are
  content-derived (sha256 of scope_key + leader embedding), so re-running the same
  deposits in the same order reproduces the same topics exactly.
- Offline threshold is 0.50 (hash embedder) vs 0.80 production (MiniLM) — same
  rationale as the search similarity threshold.
- Pre-Phase-1 deposits have `topic_id = NULL` and simply don't participate in the
  bandit (they still serve). New deposits are assigned on write. No backfill job in
  Phase 1; re-depositing (or a later maintenance script) adopts them.

## Bandit (exploration.py — pure, bounded)
- Rates: seed from the volatility hint (low 0.02 / medium 0.08 / high 0.25),
  bounded [0.01, 0.50]. Agreement ×0.85 toward the floor; disagreement ×1.6 toward
  the ceiling. Multiplicative because the response should be proportional to how
  settled the topic already looked.
- The topic also carries a `half_life_factor` ∈ [0.25, 4.0]: ×1.15 per agreement
  (settled knowledge decays slower), ×0.5 per disagreement (proven-flaky decays
  faster). Applied inside `confidence()` as a multiplier on the half-life.
- **Immediate re-verification** after a disagreement is implemented by resetting
  `last_verified_at = NULL`, which maxes the verification priority — no side
  channel, no queue, fully deterministic.
- The ONLY randomness in the system is the explore coin flip; its RNG is injected
  (`Random(seed)` in tests, real entropy in prod).

## Observed volatility
- After ≥ `observed_volatility_min_obs` (5) corroborations, the topic's
  disagreement rate classifies it: ≥30% → high, ≥10% → medium, else low — and that
  overrides the depositor's hint in the confidence computation. Below 5
  observations the hint stands (a prior needs evidence to be overturned).

## Self-verification (verification.py)
- `priority = age_since_last_verified × exploration_rate`; `verify_once()` takes
  the top `verify_batch_size` topics, re-derives via the injected `SearchProvider`,
  and feeds `corroborate()`. Single-process async loop; deliberately no
  Celery/Redis (out of scope).
- After a verify pass the topic is stamped `last_verified_at = now` even on
  disagreement — the replacement deposit was just verified by construction; the
  NEXT disagreement will reset the stamp again.
- `rrsrch-verify` (entry point) intentionally exits with instructions until a real
  SearchProvider is wired in the factory: shipping a stub that silently no-ops
  would fake the guarantee.

## Agreement gate v2 (agreement.py)
- Extraction (numbers/entities/polarity) is behind an `Extractor` protocol: regex
  by default, an LLM may implement it later — the LLM *proposes*, code *decides*.
  Rule order is safety-first: polarity mismatch → disagree; numeric mismatch
  (beyond 1% relative tolerance) → disagree; numeric match → agree; entity overlap
  (+ moderate lexical) → agree; else the Phase 0 lexical gate (0.90) as fallback.
- Numbers use subset matching (the shorter list must be covered) so an added
  context number ("… January 2026") doesn't fake a disagreement, while a changed
  price does. Known limitation, documented: antonyms without negation markers
  ("fastest" vs "slowest") still fall through to the lexical fallback.
- Every verdict logs both sides' extracted fields + the rule that fired into
  `query_events.detail` (JSONB) — auditable after the fact.

## Telemetry
- Exploration spend is logged as `explore` events and **counts against**
  `tokens_with_rrsrch` — the savings claim stays honest about what verification
  costs. Per-topic budget flow comes from GROUP BY topic_id in SQL.
- `time_to_correction` is computed deterministically at retirement time
  (now − the moment confidence crossed the serve threshold, from the closed-form
  decay inverse) and logged in the disagreed event's detail; /metrics averages it.

---

# Real-stack validation (2026-07-02)

## Divergences the in-memory store was hiding (all fixed, none skipped)
1. **`db.py` engine singleton** ignored every `Settings` after the first call —
   now cached per database URL. (Also: the test fixture injects a NullPool
   sessionmaker per test so asyncpg connections never cross pytest event loops.)
2. **`PostgresStore.log_event` dropped `event["ts"]`** — the server clock silently
   overrode the injected/simulated clock the in-memory store honored.
3. **Nondeterministic ordering on `created_at` ties** in `latest_live_deposit` and
   `recalls` — simulated clocks produce exact ties; both stores now tie-break on
   uuid identically (Python `UUID.int` order == Postgres bytewise uuid order).

## MiniLM operating point (measured, reports/real-stack.md)
- The old 0.85 default was wrong for the FUSED score (3.3% hits!) — the fusion is
  0.7·cosine + 0.3·lexical and paraphrases score low on the lexical half. Sweep
  knee = **0.525** (96.7% hits, plateau 0.40–0.53, false-hits 0 everywhere).
- MiniLM beats the hash floor 96.7% vs 86.7%; the one residual miss is acronym
  expansion ("GIL" ↔ "global interpreter lock") — model limitation, not gate bug.
- Scope hard-gate held at EVERY threshold on MiniLM (us-east-1/eu-west-1 pinned
  by an explicit integration test) — serving safety never depends on the embedder.

## Live provider
- `WebSearchProvider` = Claude Code CLI headless (`claude -p`, WebSearch/WebFetch
  allowed): search + fetch + distill with the machine's existing CLI auth, no
  separate API key. Env-gated (`RRSRCH_PROVIDER=claude-cli`); construction fails
  loudly when unconfigured — a silently no-op'ing verifier would fake the
  guarantee. Tests always use the fake provider; live runs only via
  `make verify-live` / `rrsrch-verify`.
- `tokens_spent` = the CLI's reported input+output usage — real spend, logged
  against the savings claim.

## Serve-path intent guard (false-hit hardening, 2026-07-02)
- **The hole:** polarity/predicate intelligence lived only in the corroboration
  gate; the SERVE path trusted similarity + scope. Same-scope intent flips
  ("require MFA?" vs "NOT require MFA?") measure 0.95+ on MiniLM — served wrong.
- **One extractor, two consumers:** `ClaimFields` gained `predicates`
  (antonym axis → ±1: obligation, activation, installation, direction,
  permission, inclusion, order); `RegexExtractor` populates it; the corroboration
  `verdict()` ignores it (behavior unchanged — verified by the untouched suite).
  `intent_verdict()` is the new pure function; `corpus.search` walks ranked
  candidates and serves the first that passes — a rejection is not a dead end
  (if both directions are deposited, the right one serves).
- **Asymmetry:** any flip rejects even at similarity 0.97 (false hit = wrong
  answer; false miss = one fresh search). Ambiguity never rejects: no shared
  signal → similarity decides (mirrors the corroboration lexical fallback), and
  a text containing BOTH poles of an axis drops that axis as ambiguous.
- **Suffix stripping is candidate generation, not stemming:** 'requirements'
  deliberately maps to nothing (no signal ≠ wrong signal), which is exactly why
  "what does X require?" vs "what are X's requirements?" still hits.
- **Measured** (eval, isolated corpora so intent deposits can't perturb the
  original sets): intent-false-hits 0/16 with the guard catching 16/16 on both
  hash and MiniLM; 8/8 intent-preserving paraphrases hit, 0 wrongly blocked;
  paraphrase rate unchanged (96.7% MiniLM), scope false-hits still 0.
- Known limitation (documented, accepted): antonym pairs without a lexicon entry
  or negation marker ("fastest" vs "slowest") pass through to similarity — the
  lexicon is deliberately tight because every entry can reject a serve.

## Version-aware corroboration (flywheel finding, fixed 2026-07-02)
- **Finding 1 (the proof-of-search hole):** the number extractor truncated
  dotted versions ("3.14.5" → 3.14) and the 1% relative tolerance — correct for
  prices — falsely AGREED version bumps (3.14.5≡3.14.6 after truncation;
  1.34 vs 1.35 is 0.75% apart). Corroboration then re-earned confidence for the
  outdated claim, so the verifier could never catch a version change.
- **Fix:** versions are ORDINAL, not measurements. The shared extractor now
  pulls dotted release identifiers into `ClaimFields.versions` (≥2 dots always;
  1 dot when product/marker-prefixed: "Kubernetes 1.35", "TLS 1.2"; never
  $-prefixed or %-suffixed) and excludes them from `numbers`. Verdict order:
  polarity → version_mismatch (EXACT compare) → numeric_mismatch (tolerance) →
  version/numeric match → entities → lexical.
- **Finding 2 (the harness masked it):** on `agreed` the harness overwrote its
  registry claim with truth — but the engine keeps the stored claim on agree.
  Serves of the stale text scored as true hits. Fix: classification now scores
  against `store.get(deposit_id).claim` — the engine's actual state — and the
  registry claim is never overwritten on agree.
- **Re-measured:** flywheel corroborations at s=1.0 went 38 agreed/4 disagreed →
  36/6 — the two flips are exactly the two mid-stream version changes
  (python-latest, k8s-latest), now caught and superseded; a focused trace ends
  with the engine serving the corrected claim. Aggregate precision/recall
  (0.981/0.846) barely moved but is now TRUSTWORTHY: post-change version serves
  are true hits because the corpus was corrected, not because the scorer lied.

## Implicit-scope extraction (Phase 2 thread 1, 2026-07-02)
- **The hole (found by the flywheel):** scope living in query PROSE — the
  tech/language/platform a question is about — gated nothing, so "profile
  memory in Rust" served the CSS answer at 0.87 similarity and "Ubuntu LTS"
  collided with "Django LTS".
- **Gazetteer, not NLP:** a curated alias→(dimension, canonical) table over
  three dimensions (language, technology, platform), matched on token n-grams
  (≤3). Tight by design — every entry can veto a serve; a false reject only
  costs a fresh search. An LLM may later PROPOSE tags via the same dict shape;
  conflict remains code.
- **Conflict rules** (both require signal on BOTH sides; no-signal falls
  through to similarity, the intent-guard philosophy):
  (a) per-dimension SYMMETRIC DIFFERENCE — each side carries a tag the other
      lacks → reject. Started as plain disjointness; the eval immediately found
      the flaw: {postgres, node} vs {mysql, node} intersect via the shared
      connector, masking the subject swap. Extra tags on ONE side only =
      richer wording, never a conflict.
  (b) cross-dimension union disjointness — "Ubuntu LTS" (platform) vs
      "Django LTS" (technology) share no dimension, but zero common subject
      with both sides tagged is a conflict.
- **Coverage limits (accepted, documented):** umbrella terms excluded (linux,
  aws — Ubuntu IS linux; hierarchy would false-conflict), bare common-word
  names excluded (go, r, lambda — matched only via context bigrams "in go" /
  "in r" / "aws lambda"). Unknown techs simply produce no signal and fall
  through — the gazetteer fails open, never wrong.
- **Alias normalization before comparison** (s3 == Amazon S3, postgres ==
  PostgreSQL, k8s == kubernetes, cpython → python, node.js/nodejs → node) —
  without it the gate would reject true paraphrases; the PRESERVING eval set
  pins this (9/9 on MiniLM, 0 pairs gate-removed on both embedders).
- **Storage:** deposits.inferred_scope (JSONB, migration 0004), extracted once
  at deposit() time; declared scope stays authoritative per dimension; NULL
  rows are inferred on read (scripts/backfill_inferred_scope.py persists them).
- **Measured:** implicit-scope false hits 0/14; flywheel false hits
  6/5/5 → 0/0/0 across Zipf s=0.8/1.0/1.2, precision 0.972/1.000/1.000
  (residual at s=0.8 is outdated serves, not scope), recall delta −0.003/0/0 —
  one lost hit total. Token reduction dipped 67.0%→65.7%: the false hits had
  been "saving" tokens by serving wrong answers.

## Trust-by-track-record (Phase 2 thread 2, 2026-07-02)
- **The curve:** trust = Beta ratio (agreed+α)/(agreed+contradicted+α+β) with
  α/β parameterized as prior_mean 0.85 × strength 5. Base map is piecewise
  linear: unknown → 0.96 (serves, ~11% shorter serve window → re-verified
  sooner; the single-agent regression cost is −0.3pt hit rate / −0.004 recall,
  measured), proven-good → 1.0, and TWO independent contradictions sink the
  base under the 0.70 serve line (one strike ≠ malice). Trust multiplies the
  confidence BASE — the same slot Phase 3's Ominis attestation will occupy;
  decay/corroboration/bandit untouched.
- **Independence (Sybil guard):** trust moves only on corroborations from a
  DIFFERENT depositor (rrsrch-\* verifiers count; the author never does).
  Self-agree may re-earn the anchor ONLY while the author's base ≥ serve
  threshold — preserving single-player's own stale→corroborate loop while
  denying a muted agent self-refresh. Independent agreement VOUCHES the deposit
  (independent_corroboration_count > 0 ⇒ base 1.0): a proven-bad author's
  claim can earn its way over the line on the corroboration's strength.
- **The grief guard (spec §4's own sentence, encoded):** only an equal-or-
  higher-trust corroborator or the verifier may retire a deposit and penalize
  its author; a lower-trust contradictor gets a recorded DISPUTE, no supersede
  — else a cratered agent could poison the corpus and grief honest authors
  through the corroboration channel (the first harness run demonstrated both).
- **The age rule (found by the harness):** the bare "contradicted ⇒ penalize
  author" rule punishes honesty in volatile domains — reliable trust RATCHETED
  DOWN 0.91→0.75 from pure world-churn. Now a contradiction penalizes only a
  claim still inside its effective half-life ("wrong when asserted"); a claim
  that outlived its half-life aged out — churn, not dishonesty.
- **Engine limitation the multi-agent harness exposed (recorded, OPEN — the
  sole Phase-3-gated poison item):** coordinated IDENTICAL lies cross-vouch —
  track record cannot distinguish consensus from collusion (needs identity /
  attestation; the harness salts its liars for realism).
- ~~Double-negation evasion~~ **FIXED** (see "Scoped effective polarity" below).

## Scoped effective polarity (double-negation fix, 2026-07-02)
- **The bypass:** `negated` was a document-level boolean — presence saturates,
  so "Not true: X is not required" (which MEANS "required") matched
  "X is not required", was a lexical superset, got AGREED with, vouched, and
  served (one such poison deposit served 9× in an early harness run).
- **Scoped, not counted:** global even/odd marker parity was rejected up front —
  it misfires on conjunctions of independently-negated facts ("X is not A and
  Y is not B" has two markers but is not a double negation of one proposition).
  Instead: split on clause boundaries (and/but/while/;/.) — the independence
  anchor — and within each clause compute effective polarity = LOCAL negation
  parity ⊕ SENTENTIAL truth-value-wrapper parity (tight phrase lexicon:
  "not true", "untrue", "false that", "it is false", "incorrect", "not the
  case", "mistaken that", …; sentential spans removed before the local scan so
  "not true" isn't double-counted).
- **One extractor, both consumers:** `ClaimFields.polarity` is the frozenset of
  per-clause polarities; `verdict()` (corroboration) and `intent_verdict()`
  (serve path) both compare the SET. Mixed sets ({pos,neg} vs {neg}) differ →
  disagree/reject — the conservative direction on genuinely ambiguous scoping
  (a false disagree re-derives; a false miss re-searches). `negated` survives
  as a derived legacy property.
- **Deliberately NOT a parser:** clause-split + phrase lexicon covers the
  attack class; a dependency parser is the over-correction ditch. Known
  residue: pure-prose net-affirmative rewrites without decisive comparands
  still fall to the conservative lexical fallback (disagree — recoverable).
- **Measured (reports/multi-agent.md, +dblneg-1 attacker at 10% of traffic):**
  dblneg contained 0/11 deposits ever served, trust cratered to 0.27; both
  test directions pinned (3 attack shapes disagree; conjunction reorder,
  single-neg paraphrase, original negation safety, and net-affirmative all
  behave). Malicious-1's 3 first-half serves are the BOOTSTRAP window
  (unknown-serves-at-prior, mandated by the single-player design trap), all
  corrected, 0 in the second half. Single-agent regression: hit rates
  61.5/65.5/68.8 — unchanged to the decimal.
- **Measured (reports/multi-agent.md, Postgres+MiniLM, 400q):** trust separates
  (reliable 0.985/0.908, noisy peaks then falls to 0.856, malicious 0.177 →
  base far sub-serve); poison containment 0/19 deposits ever served incl. 38
  self-corroboration attempts; false hits 0 with 40% hostile traffic; precision
  0.989; recall +0.012 vs the single-agent baseline (the extra corroboration
  traffic helped). Verifier cadence is a stated harness knob (every 10, batch
  3) — half that cadence let 1 poison deposit serve 9 times.

## Ominis attestation handshake (Phase 3, 2026-07-02)
- **Part 0 first (trust edge closed):** a `polarity_mismatch` driven purely by
  clause CARDINALITY (paraphrases segmenting differently around connectives
  outside the and/but/while set) still retires-and-replaces but no longer docks
  the author — an honest wording difference is not a lie. Clean singleton
  {pos}→{neg} flips keep the full penalty. Pinned both ways.
- **Where attestation enters — the composition rule (trap A):** a VERIFIED
  attestation shifts the Beta PRIOR toward `attested_prior_ceiling` (0.85 →
  up to 0.95) by its level; track record applies the SAME update on that
  shifted prior. Attested-unknown base 0.987 vs 0.96 ⇒ serve window +8.7%
  (trusted faster, re-verified less — boundary-probed: stale at 2.82h
  unattested, hit attested). An attested liar sinks sub-serve in ~3 independent
  contradictions — raised prior, never a free pass. Unattested ⇒ prior
  untouched ⇒ bit-for-bit Phase 2 (single-agent flywheel identical to the
  decimal).
- **Verification (deterministic, forged ≠ trusted):** `AttestationVerifier`
  interface; LOCAL verifier = HMAC-signed tokens checked with compare_digest,
  expiry against the injected clock, and BINDING (verified identity must equal
  the presenting depositor). Forged/expired/misbound/malformed all fall back to
  unattested — never an error, never trust. Real Ominis verifier is env-gated
  and fails loudly (it is a separate product consumed via this interface).
  Found-by-test: ISO expiry contains colons — token parsing uses rpartition.
- **Attestation-aware vouch (trap B — the collusion breaker):** the strong
  vouch (deposit floats at base 1.0) now requires a DISTINCT, verified-attested
  corroborator or the rrsrch verifier. Unattested corroborators still agree,
  re-earn anchors, and move track record (Phase 2 dynamics preserved) — but N
  sock-puppets can never mint the float. Scripted A/B on the real stack
  (`attested_vouch_required=False` = Phase 2 rules): the proven-bad ring's
  cross-vouched lie SERVED under Phase 2 rules (vouch count 2) and is muted
  under Phase 3 (vouch count 0), then retired by one attested auditor.
  Collusion is hereby closed as a poison class; what remains for the identical-
  lie space is only its bootstrap window, same as any unknown deposit.
- **Attestation state:** highest verified level persists on
  `depositor_trust.attested_level` (a weaker token never downgrades); the
  presented token is stored on the deposit for audit (migration 0006; NULL
  backfill = unattested = correct for all history).

## Secure-by-default attestation (review finding on b1ea823, fixed 2026-07-02)
- **The hole:** `attestation_verifier` defaulted to "local" with a hardcoded
  source-visible secret — a deployment left on defaults let an attacker
  mint_token() a valid attestation BOUND TO THEIR OWN identity, gaining the
  attested prior AND strong-vouch capability: the Sybil collusion closure
  undone by configuration. The trust LOGIC was fine; the defaults gave it away.
- **The fix (no logic change):** default verifier is now "none" (everyone
  unattested = exact Phase 2); `attestation_secret` defaults to empty; selecting
  "local" without an explicitly-set secret FAILS LOUDLY (same spirit as the
  ominis stub — never silently run a forgeable verifier, never fall back to a
  known secret). Tests/harness opt in EXPLICITLY (conftest + multiagent
  harness set verifier="local" + their own secrets), so verification coverage
  is unchanged. Pinned: on production defaults, self-minted tokens grant no
  level, no prior shift, and no strong vouch — a self-minted sock ring stays
  weak.

## Part 0 clean_flip guard — known limitation (Finding 2, recorded, accepted)
The cardinality guard cannot distinguish an honest multi-clause paraphrase from
a dishonest multi-clause claim: a malicious agent phrasing every lie as
multi-clause mixed-polarity dodges the TRACK-RECORD penalty (each lie is still
retired-and-replaced — the corpus stays correct — but the author is never muted
below serve via this path alone; numeric/version/entity mismatches still
penalize normally). Narrow, and the asymmetry is deliberate: false-penalizing
honest agents for wording differences ratchets good depositors down (the exact
failure the age rule fixed), while the residual attacker still never poisons
the corpus. Accepted as-is; revisit only with evidence from organic traffic.

## Considered, deferred
- **`never_serve` volatility tier** (always-fresh facts like FX rates, instead of
  paying ceiling-rate exploration forever): legitimate, but it's new product
  surface — out of scope for a validation task. Revisit with Phase 3.
- The bandit round trip (ceiling → floor on re-stabilization) IS tested
  (`test_bandit_round_trip_rate_recovers_when_topic_restabilizes`).

## Phase 1 exit criteria (tests/test_phase1_exit.py)
1. automatic correction: verifier + FakeSearchProvider catches a 60-day-old
   high-volatility claim, retires it, /recalls and lookup() expose the change.
2. budget steering: 60 simulated days, 1 verification/day — settled topic reaches
   the floor, volatile reaches the ceiling (19× spend concentration; curves
   printed; `make steering`). The volatile topic was hinted "low" and its observed
   volatility ends "high" — the override proven in the same run.
3. negation safety: "is compliant" vs "is not compliant" → disagreed
   (polarity_mismatch) despite lexical ≈ 0.8; numeric paraphrase → agreed
   (numeric_match) despite lexical < 0.9.
4. no regression: the Phase 0 suites run unmodified (except the corroborate tests
   whose claims now agree via numeric_match instead of lexical_match — same
   outcomes).

## Reranker task (2026-07-03): cross-encoder matcher — built, calibrated, DEFAULT OFF
- **Model choice** (calibration slice of `eval/equivalence_pairs.json` only):
  stsb-roberta-base (STS) primary + quora-roberta-large (QQP) as a low-floor
  VETO. The task-suggested ms-marco passage-relevance model fails structurally
  inside one vertical (everything is "relevant" to everything; cal AUC 0.603 vs
  0.873) — relevance ≠ same-question.
- **Honest A/B outcome:** on the held-out slice the calibrated reranker does NOT
  dominate a strict fused threshold (0.71) on the precision/recall frontier
  (retrieval false-hit 0.200@recall 0.367 vs 0.111@0.400). Win condition not
  met → `reranker="none"` stays the default; enabling is one setting with the
  calibrated operating point (0.706) preloaded. See reports/reranker.md.
- **The residual failure class is model-proof at this shelf:** lexically-twinned
  different questions ("assessment takes how long" vs "certification valid how
  long" = STS 0.96) vs cross-worded true paraphrases ("why create CMMC" vs
  "purpose of CMMC" = STS 0.55). No threshold separates them; QQP veto helps but
  caps recall (kills 11/21 true paraphrases). Next lever: fine-tune a pair
  classifier on the eval set, or the deterministic subject/entity axis.
- **One scoring path rule:** eval harness and serve path both score through
  `CrossEncoderReranker.score_pairs` — an early harness applied its own sigmoid
  on top of native [0,1] STS outputs and silently mis-calibrated the threshold.
  Never score outside the class.
- The question-equivalence eval set (188 verbatim questions / 11 independent
  origins incl. DoD CIO; 1,195 labeled pairs, group-aware cal/test split) is
  reusable infrastructure: threshold recalibration, future matcher A/Bs, and
  seed data for a fine-tuned matcher.

## Cost ledger — recording actuals, not estimates (2026-07-25)
Savings were reported entirely against the configured 90k cold-path ESTIMATE
(`make demo` showed `tokens_saved_measured: 0`). Five facts are now recorded so
the claim is auditable:

1. **Actual cold-derivation cost.** `deposit()` now logs a `derive` event
   carrying `derivation_tokens`. It logs **spend 0 on purpose**: the miss that
   preceded the deposit already charged the cold estimate, so charging again
   would double-count one derivation. Keeping the actual in `detail` instead
   lets metrics RECONCILE estimate vs reality without disturbing
   `tokens_with_rrsrch`. That reconciliation is `estimate_bias_pct` — on a
   sample run the 90k default overstated a measured 54.5k mean by 65%, i.e. the
   headline savings number was inflated by the assumption, not by the engine.
2. **Actual verification cost.** `explore` events tag `cost_basis`
   measured|estimated, so a provider-reported cost is never conflated with the
   cold-estimate fallback. Reported as measured total + mean alongside total spend.
3. **Warm-hit frequency.** hits/queries plus mean served tokens (the 22-token
   figure is now measured per-run, not quoted from one demo).
4. **Stale-verification success rate.** Corroborations carry
   `detail.verification`, set only by `_explore`, so verdicts from the
   self-verification loop are separable from agent corroborations. Reported as
   `cache_still_valid_pct` (agreed / settled). Named deliberately: a `disagreed`
   run is the loop WORKING, not a failure, so both counts are shown and the rate
   is labelled cache-still-valid rather than "success".
5. **Net tokens saved after verification.** `total_tokens_saved` was gross.
   `net_savings` subtracts verification spend and reports `verification_drag_pct`.

Coverage is always reported next to each actual (`coverage_pct`, and `None`
means nothing measured). A zero total therefore reads as "nothing reported",
never as "nothing spent" — the failure mode that would let the ledger launder an
estimate into a measurement.

Aggregation stays store-side (SQL `count(...) FILTER` / `sum(...) FILTER` in
Postgres, mirrored in memory) per the existing metrics rule. The dashboard's
`recent()` reuse feed now filters to query outcomes and over-fetches, so
bookkeeping rows never crowd real traffic out of the stream.

## Pilot shadow analysis — two independent gates (2026-07-25)
`scripts/pilot_report.py` replays a design partner's real agent traces against
an empty corpus and reports two verdicts that are deliberately NEVER combined
into one score:

- **Gate A (economics)** — net token reduction after verification spend.
- **Gate B (safety)** — precision of the answers it would have reused.

**Why separate.** Hit rate = recurrence x recall x freshness x gate-survival;
precision is not a term in it. A system can therefore post excellent savings
while serving wrong knowledge, and collapsing the two into one number lets
savings buy down a correctness failure — unacceptable in the compliance segment
that is the likeliest first market. Both gates must PASS independently.

**An unmeasured gate is not a pass.** Gate B resolves ONLY from blind human
judgments; with none supplied it reports UNDETERMINED and the run fails (exit
1). The matcher never grades itself — scoring reuse with the same similarity
function that chose the reuse is circular. Unjudged serves are never counted as
correct, and judgment coverage is reported beside the precision so a 100% drawn
from 2 of 70 serves cannot masquerade as a result. Same discipline as the cost
ledger: a zero means "nothing reported", never "nothing wrong".

**Two passes by necessity.** The judgments can only exist after a replay reveals
which serves happened, so the flow is: replay -> `--emit-judgments` worksheet ->
blind human verdicts -> replay with `--judgments`.

**`answer` is a REQUIRED input field.** With queries alone nothing can be
deposited, so nothing can be served, so safe reuse is unmeasurable — the script
refuses to run rather than silently degrade into a repetition counter.

**Traffic shape is computed without the matcher** (exact normalized text) in
three buckets, because they mean different things: same-session repeats are
loops/retries and are NOT evidence of reusable knowledge; the same actor asking
again in a later session, and a different actor converging, both are.

**Costs come from summed partner actuals**, never a unit average smeared over
the run, with the configured estimate filling in only for traces that reported
none — disclosed as coverage. Coverage is over DERIVATIONS, not all traces: a
hit needs no derivation, so counting hits in the denominator understates it.

Volatility is a CLI choice (`--volatility`) because it is domain-driven, and it
dominates the result: on a 30-day compliance sample whose questions recur about
every 5 days, the default `medium` (3-day half-life) expired the cache before
reuse and produced 63 stale / 0 hits; `low` produced 63 hits. Slow-changing
corpora must be classified `low` or the freshness term alone sinks the pilot.
