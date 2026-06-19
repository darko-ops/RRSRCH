---
id: helios-key-dual-window
project: Helios
type: decision
title: Key rotation keeps two keys valid for 24h
topic: api key rotation overlap window dual active 24 hours rollover downtime
tags: [apikey, rotation, auth]
importance: 5
supersedes: [helios-old-basic-auth]
updated: 2026-06-18
---
API key rotation is overlap-based, not cut-over. Issuing a new key for a tenant does not immediately invalidate the old one: both keys authenticate for a 24-hour overlap window, during which clients migrate at their own pace. After 24 hours the previous key is automatically revoked. This lets customers rotate credentials with zero downtime and no coordinated deploy. A tenant therefore may have at most two active keys at once.
