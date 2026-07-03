"""Ground-truth intent dataset for the flywheel harness. PURE DATA.

MATCHER-BLINDNESS (the property tests/test_flywheel_harness.py pins):
this module imports NOTHING from rrsrch — no embedder, no similarity, no
matching code. Every paraphrase below was hand-authored as a natural rewording
(LLM-authored as static text, never scored against MiniLM or any embedding
model during authoring, and never filtered by similarity afterwards). Variant
selection at stream time is a uniform draw from a seeded RNG in
eval/flywheel.py — not score-based. If paraphrases were chosen BY the matcher,
the flywheel measurement would be circular; they are not.

Labels the engine never sees: (intent_id, scope_key, polarity).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


def label_scope_key(scope: dict[str, Any] | None) -> str:
    """Canonical scope identity for LABELS (harness-side twin of the engine's
    normalization — deliberately reimplemented so the harness imports nothing
    from the engine)."""
    if not scope:
        return ""
    norm = {str(k).strip().lower(): (v.strip().lower() if isinstance(v, str) else v)
            for k, v in scope.items()}
    return json.dumps(norm, sort_keys=True, separators=(",", ":"))


@dataclass(frozen=True)
class Intent:
    intent_id: str
    domain: str                       # compliance | pricing | versions | durable
    volatility: str                   # low | medium | high (the hint the engine gets)
    canonical: str                    # the canonical query wording
    paraphrases: tuple[str, ...]      # SHOULD hit (same intent/scope/polarity)
    answer: str                       # ground-truth claim (v1)
    answer_v2: str | None = None      # truth CHANGES mid-stream when set
    scope: dict[str, Any] | None = None
    alt_scope: dict[str, Any] | None = None   # scope variant: must NOT hit primary
    alt_scope_answer: str | None = None
    flip: str | None = None           # intent-flip wording: must NOT hit primary
    flip_answer: str | None = None    # ...but has its own correct answer

    def scope_key(self) -> str:
        return label_scope_key(self.scope)


INTENTS: tuple[Intent, ...] = (
    # ------------------------------------------------------- compliance (low)
    Intent("cmmc-mfa", "compliance", "low",
           "Does CMMC Level 2 require multi-factor authentication?",
           ("Is MFA mandatory for CMMC Level 2?",
            "Do I need multi-factor authentication for CMMC L2 compliance?",
            "CMMC Level 2 MFA requirement",
            "Is multi-factor auth needed under CMMC Level 2?"),
           "Yes — CMMC Level 2 requires MFA under IA.L2-3.5.3 for network access.",
           flip="Does CMMC Level 2 not require multi-factor authentication?",
           flip_answer="No — that's incorrect; CMMC Level 2 does require MFA (IA.L2-3.5.3)."),
    Intent("gdpr-us", "compliance", "low",
           "Does GDPR apply to US companies serving EU users?",
           ("Are US companies serving EU users subject to GDPR?",
            "Does GDPR cover an American company with European customers?",
            "GDPR applicability to US businesses with EU users",
            "Is a US-based SaaS bound by GDPR if it has EU users?"),
           "Yes — GDPR applies extraterritorially under Article 3(2)."),
    Intent("soc2-pentest", "compliance", "low",
           "Does SOC 2 Type II require an annual penetration test?",
           ("Is a yearly pentest mandatory for SOC 2 Type II?",
            "SOC 2 Type II penetration testing requirement",
            "Do we have to run annual penetration tests for SOC 2 Type II?",
            "Is an annual pentest required to pass SOC 2 Type II?"),
           "Not strictly — SOC 2 requires monitoring controls; most auditors expect "
           "a pentest or equivalent vulnerability management evidence."),
    Intent("hipaa-encrypt", "compliance", "low",
           "Is encryption at rest required under HIPAA?",
           ("Does HIPAA mandate encrypting data at rest?",
            "HIPAA encryption-at-rest requirement",
            "Under HIPAA, must PHI be encrypted at rest?",
            "Is at-rest encryption compulsory for HIPAA compliance?"),
           "Addressable, not strictly required — but unencrypted PHI at rest must be "
           "justified and compensated, so in practice you encrypt."),
    Intent("pci-scans", "compliance", "low",
           "Does PCI DSS require quarterly vulnerability scans?",
           ("Are quarterly vuln scans mandatory under PCI DSS?",
            "PCI DSS external scan frequency requirement",
            "How often does PCI DSS say we must run vulnerability scans?",
            "Is a quarterly ASV scan required for PCI DSS?"),
           "Yes — quarterly external scans by an ASV plus internal scans (Req. 11.3)."),
    Intent("cmmc-poam", "compliance", "low",
           "Are POA&Ms allowed in CMMC Level 2 certification?",
           ("Can I certify CMMC Level 2 with open POA&M items?",
            "CMMC Level 2 POA&M policy",
            "Does CMMC L2 permit plans of action and milestones?",
            "Are open POA&Ms acceptable for a CMMC Level 2 assessment?"),
           "Limited — POA&Ms are allowed for a subset of 1-point controls, closed "
           "within 180 days; minimum score applies."),

    # ------------------------------------------------ cloud pricing (high, scoped)
    Intent("s3-price", "pricing", "high",
           "What is the S3 Standard storage price per GB?",
           ("S3 Standard per-GB monthly cost",
            "How much does S3 Standard storage cost per gigabyte?",
            "current price of S3 Standard storage per GB",
            "What am I paying per GB for S3 Standard?"),
           "$0.023 per GB-month (first 50 TB tier).",
           answer_v2="$0.021 per GB-month (first 50 TB tier) after the price cut.",
           scope={"region": "us-east-1"},
           alt_scope={"region": "eu-west-1"},
           alt_scope_answer="$0.024 per GB-month (first 50 TB tier) in eu-west-1."),
    Intent("ec2-m5", "pricing", "high",
           "What is the EC2 m5.large on-demand hourly price?",
           ("m5.large on-demand cost per hour",
            "hourly rate for an EC2 m5.large instance",
            "How much is an m5.large per hour on demand?",
            "EC2 m5.large price per hour"),
           "$0.096 per hour on-demand.",
           answer_v2="$0.093 per hour on-demand after the reduction.",
           scope={"region": "us-east-1"},
           alt_scope={"region": "ap-south-1"},
           alt_scope_answer="$0.101 per hour on-demand in ap-south-1."),
    Intent("lambda-price", "pricing", "high",
           "What is the AWS Lambda price per million requests?",
           ("Lambda cost per 1M invocations",
            "How much do a million Lambda requests cost?",
            "AWS Lambda request pricing per million",
            "price for 1,000,000 Lambda invocations"),
           "$0.20 per million requests plus GB-second duration charges.",
           scope={"region": "us-east-1"},
           alt_scope={"region": "eu-central-1"},
           alt_scope_answer="$0.20 per million requests in eu-central-1 (duration rates differ)."),
    Intent("egress-price", "pricing", "high",
           "What is the AWS data transfer out to internet price per GB?",
           ("AWS egress cost per gigabyte",
            "How much does AWS charge per GB for internet egress?",
            "data transfer out pricing on AWS per GB",
            "per-GB price of AWS outbound traffic"),
           "$0.09 per GB after the 100 GB free tier (first 10 TB tier).",
           scope={"region": "us-east-1"},
           alt_scope={"region": "ap-northeast-1"},
           alt_scope_answer="$0.114 per GB (first 10 TB tier) from ap-northeast-1."),
    Intent("gcs-price", "pricing", "high",
           "What is the Google Cloud Storage standard price per GB?",
           ("GCS standard storage monthly per-GB cost",
            "How much is Google Cloud Storage standard class per gigabyte?",
            "google cloud storage standard tier pricing per GB",
            "per-GB rate for GCS standard storage"),
           "$0.020 per GB-month.",
           scope={"region": "us"},
           alt_scope={"region": "eu"},
           alt_scope_answer="$0.023 per GB-month in the EU multi-region."),
    Intent("rds-price", "pricing", "high",
           "What is the RDS Postgres db.t3.medium hourly price?",
           ("db.t3.medium RDS PostgreSQL cost per hour",
            "hourly price of RDS Postgres on a db.t3.medium",
            "How much does a db.t3.medium RDS Postgres instance cost hourly?",
            "RDS PostgreSQL db.t3.medium on-demand rate"),
           "$0.072 per hour single-AZ on-demand.",
           answer_v2="$0.068 per hour single-AZ on-demand after repricing.",
           scope={"region": "us-east-1"},
           alt_scope={"region": "eu-west-1"},
           alt_scope_answer="$0.079 per hour single-AZ on-demand in eu-west-1."),

    # ------------------------------------------------- software versions (medium)
    Intent("python-latest", "versions", "medium",
           "What is the latest stable Python 3 release?",
           ("current stable Python version",
            "newest Python 3.x release",
            "Which Python 3 version is the latest stable one?",
            "most recent stable release of Python"),
           "Python 3.14.5.",
           answer_v2="Python 3.14.6, released June 10, 2026."),
    Intent("node-lts", "versions", "medium",
           "What is the current Node.js LTS version?",
           ("Node LTS version right now",
            "Which Node.js release line is in LTS?",
            "current long-term-support version of Node",
            "What Node version should I target for LTS?"),
           "Node.js 24 (LTS line)."),
    Intent("postgres-latest", "versions", "medium",
           "What is the latest PostgreSQL major version?",
           ("newest Postgres major release",
            "current major version of PostgreSQL",
            "Which PostgreSQL major version is newest?",
            "latest major Postgres version available"),
           "PostgreSQL 18.",),
    Intent("k8s-latest", "versions", "medium",
           "What is the latest stable Kubernetes minor version?",
           ("current Kubernetes minor release",
            "newest stable k8s version",
            "Which Kubernetes minor version is current?",
            "latest k8s minor release"),
           "Kubernetes 1.34.",
           answer_v2="Kubernetes 1.35."),
    Intent("django-lts", "versions", "medium",
           "What is the current Django LTS version?",
           ("Django long-term support release",
            "Which Django version is the LTS?",
            "current LTS line for Django",
            "Django LTS version to build on"),
           "Django 5.2 LTS."),
    Intent("ubuntu-lts", "versions", "medium",
           "What is the latest Ubuntu LTS release?",
           ("newest Ubuntu long-term support version",
            "current Ubuntu LTS",
            "Which Ubuntu release is the latest LTS?",
            "most recent LTS version of Ubuntu"),
           "Ubuntu 26.04 LTS."),

    # ---------------------------------------------------- durable how-tos (low)
    Intent("gil", "durable", "low",
           "What is the Python GIL?",
           ("explain the global interpreter lock in Python",
            "What does Python's GIL do?",
            "purpose of the GIL in CPython",
            "Why does Python have a global interpreter lock?"),
           "The GIL is CPython's mutex allowing one thread to execute bytecode at a "
           "time; free-threaded builds relax this."),
    Intent("tcp-handshake", "durable", "low",
           "How does the TCP three-way handshake work?",
           ("explain TCP's 3-way handshake",
            "What are the steps of a TCP handshake?",
            "SYN SYN-ACK ACK sequence explained",
            "how a TCP connection gets established"),
           "SYN → SYN-ACK → ACK: sequence numbers are exchanged and both sides "
           "confirm before data flows."),
    Intent("jwt-verify", "durable", "low",
           "How do I verify a JWT signature?",
           ("verifying a JSON Web Token's signature",
            "How can I check that a JWT is validly signed?",
            "JWT signature verification steps",
            "validate the signature on a JWT"),
           "Fetch the issuer's JWKS, select the key by kid, verify alg + signature, "
           "then check exp/aud/iss claims."),
    Intent("s3-versioning", "durable", "low",
           "How do I enable S3 bucket versioning?",
           ("turn on versioning for an S3 bucket",
            "steps to activate S3 versioning",
            "How can I switch on object versioning in S3?",
            "enabling versioning on an Amazon S3 bucket"),
           "Call PutBucketVersioning with Status=Enabled (console: Properties → "
           "Bucket Versioning).",
           flip="How do I disable S3 bucket versioning?",
           flip_answer="You can't fully disable it once enabled — only suspend: "
                       "PutBucketVersioning with Status=Suspended."),
    Intent("docker-install", "durable", "low",
           "How to install Docker on Ubuntu 22.04",
           ("installing Docker Engine on Ubuntu 22.04",
            "steps to set up Docker on an Ubuntu 22.04 box",
            "How do I get Docker running on Ubuntu 22.04?",
            "Docker installation guide for Ubuntu 22.04"),
           "Add Docker's apt repo + GPG key, then apt-get install docker-ce "
           "docker-ce-cli containerd.io.",
           flip="How to uninstall Docker from Ubuntu 22.04",
           flip_answer="apt-get purge docker-ce docker-ce-cli containerd.io, then "
                       "remove /var/lib/docker and /var/lib/containerd."),
    Intent("git-squash", "durable", "low",
           "How do I squash commits with git rebase?",
           ("squashing several commits into one using rebase",
            "git rebase interactive squash workflow",
            "How can I combine multiple commits via git rebase?",
            "use rebase to squash a branch's commits"),
           "git rebase -i <base>, mark all but the first commit as squash/fixup, "
           "save, then force-push with --force-with-lease."),
)

# Deterministic, unlimited pool of UNRELATED one-off queries (no correct answer
# exists in the corpus; each is asked at most once — keeps the corpus sparse).
_ONEOFF_TASKS = (
    "center a div", "parse a CSV", "profile memory usage", "set an environment variable",
    "rename a branch", "schedule a cron job", "read a stack trace", "mock a HTTP call",
    "batch-resize images", "tail a log file", "diff two JSON files", "throttle a function",
)
_ONEOFF_TECH = (
    "CSS", "Rust", "Go", "Excel", "Swift", "Kotlin", "Bash", "R",
    "Elixir", "Haskell", "PHP", "Perl",
)


def one_off(index: int) -> tuple[str, str]:
    """(query, its unique ground-truth answer). Combinatorial and deterministic."""
    task = _ONEOFF_TASKS[index % len(_ONEOFF_TASKS)]
    tech = _ONEOFF_TECH[(index // len(_ONEOFF_TASKS)) % len(_ONEOFF_TECH)]
    n = index // (len(_ONEOFF_TASKS) * len(_ONEOFF_TECH))
    suffix = f" (case {n})" if n else ""
    return (f"How do I {task} in {tech}{suffix}?",
            f"One-off answer: {task} in {tech}{suffix}.")
