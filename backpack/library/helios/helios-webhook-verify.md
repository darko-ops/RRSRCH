---
id: helios-webhook-verify
project: Helios
type: constraint
title: Verify webhook HMAC + reject >5min skew
topic: webhook signature hmac verify per-endpoint secret timestamp skew reject replay
tags: [webhook, security, hmac]
importance: 5
updated: 2026-06-18
---
Every inbound provider webhook must be verified before any processing. Compute the HMAC over the raw request body using the per-endpoint signing secret (each provider endpoint has its own secret in the webhook_endpoints table) and constant-time compare it to the signature header. Reject the request with HTTP 401 if the signature is invalid. Also reject if the signed timestamp is more than 5 minutes from server time, to block replay. Never trust a webhook payload that has not passed both checks.
