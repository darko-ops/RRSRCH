---
id: helios-idempotency-required
project: Helios
type: warning
title: Billing mutations require an Idempotency-Key
topic: billing mutation idempotency key header charge credit invoice
tags: [billing, idempotency, api]
importance: 5
always: true
updated: 2026-06-18
---
Every billing mutation — charges, credits, and invoice writes — must carry a client-supplied Idempotency-Key header. Reject any billing write that arrives without one with HTTP 400 and make no state change.
