"""Configuration (pydantic-settings, env-prefixed RRSRCH_). Every tuning knob —
similarity threshold, freshness threshold, decay half-lives, fusion weights — lives
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
    # Fused similarity threshold. Conservative on purpose: a false hit is worse than
    # a miss. Default tuned for sentence-transformers; lower for the hash fallback.
    similarity_threshold: float = 0.85
    candidate_k: int = 20
    vector_weight: float = 0.7   # fusion: w_vec * cosine + w_lex * lexical
    lexical_weight: float = 0.3

    # --- freshness (simple decay only — Phase 0) ---
    freshness_threshold: float = 0.5            # serve if decay >= this
    half_life_low_days: float = 180.0           # decays over months
    half_life_medium_days: float = 3.0          # decays over days
    half_life_high_hours: float = 6.0           # decays over hours

    # --- telemetry ---
    cold_path_estimate_tokens: int = 90_000     # default cold-derivation cost if caller omits one
