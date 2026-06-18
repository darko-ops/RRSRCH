---
id: webhook-signature
project: Bouncr
type: constraint
title: Webhooks must verify signature server-side
topic: stripe webhook signature verification security
tags: [stripe, webhook, security]
importance: 4
updated: 2026-05-21
---
All Stripe webhooks must verify their signature server-side before processing.
Reject any event whose signature does not validate against the endpoint secret.
