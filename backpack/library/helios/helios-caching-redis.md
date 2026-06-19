---
id: helios-caching-redis
project: Helios
type: decision
title: Read-through Redis cache for summaries
topic: cache redis read-through ttl usage summary invalidate rollup dashboard
tags: [cache, redis]
importance: 3
updated: 2026-06-18
---
Usage summaries shown in the dashboard are served from a read-through Redis cache with a 60-second TTL. On a cache miss the summary is computed from the latest rollup and written back. The cache key includes tenant id and metric, and entries are explicitly invalidated whenever a rollup advances the watermark so customers never see stale totals for more than the TTL.
