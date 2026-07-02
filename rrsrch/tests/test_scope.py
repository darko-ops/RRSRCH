from __future__ import annotations

from rrsrch.matching.scope import (conflicts, effective_tags, implicit_conflicts,
                                   infer)


def test_conflict_on_shared_key():
    assert conflicts({"region": "us-east-1"}, {"region": "eu-west-1"}) is True
    assert conflicts({"version": "3"}, {"version": "4"}) is True


def test_no_conflict_when_equal_or_disjoint():
    assert conflicts({"region": "us-east-1"}, {"region": "us-east-1"}) is False
    assert conflicts({"region": "us-east-1"}, {"version": "4"}) is False  # no shared key
    assert conflicts(None, {"region": "x"}) is False
    assert conflicts({}, None) is False


def test_normalized_comparison():
    assert conflicts({"region": "US-EAST-1"}, {"region": " us-east-1 "}) is False


# ------------------------------------------------- implicit scope (Phase 2)


def test_infer_extracts_and_normalizes_aliases():
    assert infer("How do I profile memory usage in Rust?") == {"language": {"rust"}}
    assert infer("turn on Amazon S3 versioning") == {"technology": {"s3"}}
    assert infer("enable versioning on an S3 bucket") == {"technology": {"s3"}}
    assert infer("newest postgres major release") == \
        infer("What is the latest PostgreSQL major version?")
    assert infer("how to list pods in k8s") == {"technology": {"kubernetes"}}
    assert infer("purpose of the GIL in CPython") == {"language": {"python"}}
    assert infer("current Node.js LTS version") == {"technology": {"node"}}
    assert infer("How to install Docker on Ubuntu 22.04") == \
        {"technology": {"docker"}, "platform": {"ubuntu"}}


def test_infer_context_bigrams_and_exclusions():
    # Go and R only match in context — bare tokens are common words
    assert infer("How to schedule a cron job in Go") == {"language": {"golang"}}
    assert infer("plotting in R with ggplot") == {"language": {"rlang"}}
    assert infer("how do I go about renaming a branch") == {}
    # umbrella terms deliberately absent (Ubuntu IS linux — hierarchy trap)
    assert infer("set ulimit on Linux") == {}
    assert infer("a lambda function in Python")["language"] == {"python"}
    assert "technology" not in infer("a lambda function in Python")  # bare lambda ≠ AWS


def test_implicit_conflict_rules():
    rust = infer("profile memory in Rust")
    css = infer("profile memory in CSS")
    assert implicit_conflicts(rust, css) is True          # (a) same dim, disjoint
    # (a) shared tech agrees, platform splits → still a conflict
    assert implicit_conflicts(infer("install Docker on Ubuntu"),
                              infer("install Docker on Alpine")) is True
    # (b) cross-dimension, zero common subject
    assert implicit_conflicts(infer("newest Ubuntu LTS release"),
                              infer("Django LTS version")) is True
    # (a) symmetric form: subject swap masked by a shared connector tech
    assert implicit_conflicts(infer("connect to Postgres from Node.js"),
                              infer("connect to MySQL from Node.js")) is True
    # ...but EXTRA tags on one side only = richer wording, not a conflict
    assert implicit_conflicts(infer("deploy a Flask app with nginx"),
                              infer("deploy a Flask app")) is False
    # one-sided or no signal never gates
    assert implicit_conflicts(rust, {}) is False
    assert implicit_conflicts({}, {}) is False
    assert implicit_conflicts(infer("squash commits with git rebase"),
                              infer("squashing several commits into one")) is False
    # aliases normalize before comparison — S3 == Amazon S3
    assert implicit_conflicts(infer("enable S3 bucket versioning"),
                              infer("turn on Amazon S3 versioning")) is False


def test_declared_scope_is_authoritative_over_inferred():
    tags = effective_tags("profile memory in Rust", {"language": "Java"})
    assert tags["language"] == {"java"}    # declared wins its dimension
