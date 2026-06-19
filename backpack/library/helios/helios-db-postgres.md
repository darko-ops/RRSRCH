---
id: helios-db-postgres
project: Helios
type: reference
title: Postgres 15 primary datastore
topic: postgres database row level security replication datastore migrations
tags: [database, postgres]
importance: 2
updated: 2026-06-18
---
The primary datastore is Postgres 15. Tenant isolation is enforced with row-level security, and read traffic is served from logical-replication read replicas. Schema changes go through reviewed, backward-compatible migrations applied online.
