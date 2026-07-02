"""Configuration (pydantic-settings, env-prefixed RRSRCH_). Every tuning knob —
similarity threshold, confidence threshold, decay half-lives, fusion weights — lives
here so matching can be tuned without code changes."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RRSRCH_", env_file=".env", extra="ignore")

    # storage: "postgres" (deployable) | "memory" (eval/tests)
    store: str = "postgres"
    database_url: str = "postgresql+asyncpg://rrsrch:rrsrch@localhost:5432/rrsrch"

    # embeddings: "local" (sentence-transformers) | "hash" (offline fallback) | "api"
    embedder: str = "local"
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384
    embedding_api_url: str | None = None  # used when embedder == "api"

    # --- matching (the hard part) ---
    # FUSED similarity threshold (0.7·cosine + 0.3·lexical — NOT raw cosine).
    # 0.525 is the measured knee of the MiniLM sweep on the real stack
    # (2026-07-02, eval/run_eval.py RRSRCH_EVAL_SWEEP): paraphrase hits 96.7%,
    # scope false-hits 0, wrong-topic serves 0, safe plateau 0.40–0.53.
    # Hash embedder operating point is 0.42 (see DECISIONS).
    similarity_threshold: float = 0.525
    candidate_k: int = 20
    vector_weight: float = 0.7   # fusion: w_vec * cosine + w_lex * lexical
    lexical_weight: float = 0.3

    # --- confidence (deterministic decay + corroboration re-earning) ---
    confidence_threshold: float = 0.70          # serve if live confidence >= this
    half_life_low_days: float = 180.0           # decays over months
    half_life_medium_days: float = 3.0          # decays over days
    half_life_high_hours: float = 6.0           # decays over hours

    # --- corroboration agreement gate (deterministic; see agreement.py) ---
    # Lexical fallback when extraction yields nothing. Conservative on purpose:
    # a false "agreed" wrongly re-earns confidence; a false "disagreed" merely
    # replaces the claim with the fresh one — recoverable. Err toward disagreement.
    claim_agreement_threshold: float = 0.90
    numeric_tolerance: float = 0.01             # relative; numbers are load-bearing
    entity_overlap_threshold: float = 0.5       # shared-entity fraction for entity_match
    entity_lexical_floor: float = 0.45          # entity_match also needs this much lexical

    # --- exploration bandit (per-topic; see exploration.py) ---
    exploration_base_low: float = 0.02          # priors seeded from volatility_hint
    exploration_base_medium: float = 0.08
    exploration_base_high: float = 0.25
    exploration_floor: float = 0.01
    exploration_ceiling: float = 0.50
    exploration_decay_factor: float = 0.85      # on agreement → toward floor
    exploration_growth_factor: float = 1.60     # on disagreement → toward ceiling
    half_life_factor_min: float = 0.25          # bounds on the topic decay adjustment
    half_life_factor_max: float = 4.0
    half_life_agreement_growth: float = 1.15    # agreement slows this topic's decay
    half_life_disagreement_shrink: float = 0.50 # disagreement speeds it up

    # --- depositor trust (track record only — Ominis attestation is Phase 3) ---
    # Beta prior: unknown depositors land at trust = prior_mean (serviceable).
    trust_prior_mean: float = 0.85
    trust_prior_strength: float = 5.0           # how much evidence to move the prior
    # trust → confidence-base map: unknown serves at a slightly reduced base
    # (re-verified sooner); below the prior the base drops steeply so ~2
    # independent contradictions sink a depositor under the serve threshold.
    trust_base_at_prior: float = 0.96
    trust_sub_slope: float = 1.4

    # --- attestation (Phase 3: verifiable identity weighting the trust prior) ---
    # SECURE BY DEFAULT: "none" ⇒ everyone unattested ⇒ exact Phase 2 behavior.
    # Attestation activates only by deliberate choice. "local" (HMAC test
    # tokens) REQUIRES an explicitly-set secret — a deployment left on defaults
    # must never run a verifier whose secret an attacker can read from source
    # (that would let them mint self-bound tokens and re-open Sybil collusion).
    attestation_verifier: str = "none"          # none | local | ominis
    attestation_secret: str = ""                # REQUIRED for "local"; no default
    # composition: an attested identity's Beta PRIOR shifts toward this ceiling
    # by its attestation level; track record then adjusts it exactly as before.
    attested_prior_ceiling: float = 0.95
    # strong vouch (deposit floats at base 1.0) requires an ATTESTED distinct
    # corroborator (or rrsrch's own verifier). False = Phase 2 rules (A/B lever
    # for the collusion comparison — do not disable in production).
    attested_vouch_required: bool = True

    # --- observed volatility (evidence overrides the hint) ---
    observed_volatility_min_obs: int = 5        # corroborations before override kicks in
    observed_high_cutoff: float = 0.30          # disagreement rate >= → 'high'
    observed_medium_cutoff: float = 0.10        # >= → 'medium'; below → 'low'

    # --- topics (deterministic leader clustering) ---
    topic_similarity_threshold: float = 0.80    # centroid cosine to join a topic

    # --- self-verification loop ---
    verify_batch_size: int = 3                  # topics per verify_once() pass
    verify_interval_seconds: float = 300.0      # verify_loop cadence

    # --- live search provider (env-gated; tests always use the fake) ---
    provider: str = "none"                      # "claude-cli" enables live research
    claude_bin: str = "claude"                  # Claude Code CLI binary
    provider_model: str | None = None           # optional --model override
    provider_timeout_seconds: float = 300.0

    # --- telemetry ---
    cold_path_estimate_tokens: int = 90_000     # default cold-derivation cost if caller omits one
