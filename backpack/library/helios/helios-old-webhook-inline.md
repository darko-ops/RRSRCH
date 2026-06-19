---
id: helios-old-webhook-inline
project: Helios
type: decision
title: (OLD) Inline webhook processing
topic: webhook inline processing legacy request handler superseded
tags: [webhook, legacy]
importance: 2
stale: true
updated: 2026-06-18
---
Superseded. Webhooks were once verified and fully processed inline inside the request handler before returning a response. Providers timed out and retried on slow downstream calls, producing duplicate processing. It was replaced by acknowledge-then-process-async. Kept for history; do not build on this.
