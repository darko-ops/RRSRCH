"""Attestation — verifiable external identity feeding the trust base (Phase 3).

=============================================================================
THE INVIOLABLE RULE: attestation verification and its weight on confidence are
DETERMINISTIC code. An LLM never issues, interprets, or weights an attestation.
A token that fails signature, is expired, or is NOT BOUND to the presenting
depositor grants NOTHING — the depositor is treated as unattested (today's
exact behavior), never rejected, never trusted. Forged ≠ trusted.
=============================================================================

rrsrch does not depend on Ominis existing: this module consumes attestations
via an interface. The LOCAL verifier (HMAC-signed test tokens) is the fake for
tests and the harness — the SearchProvider pattern; a real Ominis verifier is
env-gated and fails loudly when unconfigured.

Token format (local): "ominis1:<identity>:<level>:<expiry-iso>:<hmac-sha256>"
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from .config import Settings


@dataclass(frozen=True)
class AttestationResult:
    verified: bool
    identity: str | None = None
    level: float = 0.0          # 0..1 attestation tier/strength

    @staticmethod
    def unattested() -> "AttestationResult":
        return AttestationResult(False)


class AttestationVerifier(Protocol):
    def verify(self, token: str | None, depositor: str,
               now: datetime) -> AttestationResult: ...


def _sign(identity: str, level: str, expiry: str, secret: str) -> str:
    msg = f"{identity}|{level}|{expiry}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def mint_token(identity: str, level: float, expires: datetime, secret: str) -> str:
    """Test/harness helper — mints a token the LOCAL verifier accepts."""
    lv, exp = f"{level:.4f}", expires.isoformat()
    return f"ominis1:{identity}:{lv}:{exp}:{_sign(identity, lv, exp, secret)}"


class LocalAttestationVerifier:
    """Deterministic offline verifier over HMAC-signed tokens. Every rejection
    path returns UNATTESTED (fall back to track record) — never an error."""

    def __init__(self, secret: str) -> None:
        self._secret = secret

    def verify(self, token: str | None, depositor: str,
               now: datetime) -> AttestationResult:
        if not token:
            return AttestationResult.unattested()
        head, _, sig = token.rpartition(":")          # ISO expiry contains colons
        parts = head.split(":", 3)
        if len(parts) != 4 or parts[0] != "ominis1" or not sig:
            return AttestationResult.unattested()
        _, identity, level_s, expiry_s = parts
        if not hmac.compare_digest(sig, _sign(identity, level_s, expiry_s,
                                              self._secret)):
            return AttestationResult.unattested()          # forged
        try:
            expiry = datetime.fromisoformat(expiry_s)
            level = min(1.0, max(0.0, float(level_s)))
        except ValueError:
            return AttestationResult.unattested()
        if expiry <= now:
            return AttestationResult.unattested()          # expired
        if identity != depositor:
            return AttestationResult.unattested()          # not bound to presenter
        return AttestationResult(True, identity, level)


class NullAttestationVerifier:
    """No attestation support configured: everyone is unattested (Phase 2)."""

    def verify(self, token: str | None, depositor: str,
               now: datetime) -> AttestationResult:
        return AttestationResult.unattested()


def build_attestation_verifier(settings: Settings) -> AttestationVerifier:
    if settings.attestation_verifier == "local":
        if not settings.attestation_secret:
            raise RuntimeError(
                "attestation_verifier='local' requires an explicitly-set "
                "RRSRCH_ATTESTATION_SECRET. Refusing to run a forgeable verifier "
                "on a known/empty secret — that would let anyone mint valid "
                "attestations and re-open Sybil collusion. Set a secret, or use "
                "attestation_verifier='none' (everyone unattested).")
        return LocalAttestationVerifier(settings.attestation_secret)
    if settings.attestation_verifier == "ominis":
        raise RuntimeError(
            "Ominis attestation verifier is not wired yet — it is a separate "
            "product consumed via this interface. Set RRSRCH_ATTESTATION_VERIFIER="
            "local (signed test tokens) or none. (Refusing to no-op silently.)")
    return NullAttestationVerifier()
