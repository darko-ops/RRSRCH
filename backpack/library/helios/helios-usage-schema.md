---
id: helios-usage-schema
project: Helios
type: reference
title: usage_events table schema
topic: usage event schema fields tenant metric quantity table metering idempotency event_time
tags: [usage, schema, metering]
importance: 3
updated: 2026-06-18
---
Raw usage events are stored append-only in the usage_events table. Each row has tenant_id, metric, quantity, idempotency_key, and event_time, plus an ingest timestamp. The idempotency_key deduplicates retried submissions from customer agents. Events are immutable once written; corrections are made by emitting compensating events, not by updating rows.
