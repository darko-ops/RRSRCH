from __future__ import annotations

import pytest
from pydantic import ValidationError

from rrsrch.schemas import DepositIn, Source


def test_valid_deposit():
    d = DepositIn(query="q", claim="c", sources=[Source(url="https://x")], volatility_hint="low")
    assert d.depositor == "local" and d.scope is None


def test_rejects_empty_query_and_claim():
    with pytest.raises(ValidationError):
        DepositIn(query="", claim="c")
    with pytest.raises(ValidationError):
        DepositIn(query="q", claim="")


def test_rejects_bad_volatility():
    with pytest.raises(ValidationError):
        DepositIn(query="q", claim="c", volatility_hint="sometimes")


def test_sources_shape():
    d = DepositIn(query="q", claim="c", sources=[{"url": "https://x", "title": "T"}])
    assert d.sources[0].url == "https://x" and d.sources[0].title == "T"
