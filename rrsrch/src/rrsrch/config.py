"""Runtime configuration (pydantic-settings, from env). Every knob the operator
tunes lives here: thresholds, half-lives, similarity floor, cold-path estimate."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RRSRCH_", env_file=".env", extra="ignore")

    # --- storage ---
    # "postgres" -> Postgres+pgvector (deployable); "memory" -> in-process (demo/tests).
    store: str = "postgres"
    database_url: str = "postgresql+asyncpg://rrsrch:rrsrch@localhost:5432/rrsrch"

    # --- embeddings ---
    # "local" -> sentence-transformers; "hash" -> deterministic offline fallback.
    embedder: str = "local"
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384

    # --- trust thresholds (deterministic engine) ---
    serve_threshold: float = 0.70
    retire_floor: float = 0.15
    base_confidence: float = 0.80

    # --- matching ---
    similarity_floor: float = 0.82   # cosine
    candidate_k: int = 10
    agreement_floor: float = 0.90    # claim-vs-claim cosine for corroboration

    # --- decay half-lives (seconds) ---
    half_life_low_days: float = 180.0
    half_life_medium_days: float = 14.0
    half_life_high_days: float = 1.0

    # --- telemetry ---
    cold_path_estimate_tokens: int = 90_000  # what a full cold derivation costs


def get_settings() -> Settings:
    return Settings()
