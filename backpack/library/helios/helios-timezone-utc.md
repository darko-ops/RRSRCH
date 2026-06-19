---
id: helios-timezone-utc
project: Helios
type: constraint
title: All aggregation in UTC
topic: timezone utc timestamps aggregation usage rollup local billing period
tags: [time, utc]
importance: 3
updated: 2026-06-18
---
All timestamps in Helios are stored and computed in UTC. Usage aggregation, billing-period boundaries, and rollups all use UTC day boundaries; tenant-local timezones are only applied for display in the dashboard. Never aggregate usage or close a billing period on a tenant’s local calendar day. event_time is recorded as a UTC instant at ingest.
