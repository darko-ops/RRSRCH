---
id: helios-rollup-watermark
project: Helios
type: decision
title: Usage rollups are watermark-keyed and idempotent
topic: usage rollup watermark idempotent nightly aggregate billing metering rerun events
tags: [usage, rollup, billing]
importance: 5
supersedes: [helios-old-hourly-rollup]
updated: 2026-06-18
---
Usage rollups are keyed by a monotonic per-tenant event watermark, not by wall-clock time. Each run reads events strictly after the stored watermark, aggregates them into the billable rollup, and advances the watermark in the same transaction. Re-running a rollup is therefore idempotent: a crashed or repeated run reprocesses from the last committed watermark without double-counting. Never recompute a period by summing all of its events from scratch — that path was retired because it double-billed on retries. The watermark lives in the rollup_state table, one row per (tenant, metric).
