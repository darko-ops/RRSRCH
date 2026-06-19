---
id: helios-rate-limit
project: Helios
type: constraint
title: Per-tenant token-bucket rate limiting
topic: rate limit token bucket tenant 429 retry-after throttle api edge
tags: [ratelimit, api]
importance: 3
updated: 2026-06-18
---
Inbound API traffic is rate-limited per tenant using a token-bucket limiter sized at 1000 requests per second with a small burst allowance. Over-limit requests receive HTTP 429 with a Retry-After header indicating when to retry. Limits are enforced at the edge gateway before requests reach application services. Internal service-to-service calls are exempt and use a separate quota.
