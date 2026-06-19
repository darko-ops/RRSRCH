---
id: helios-webhook-retry-table
project: Helios
type: reference
title: webhook_deliveries table
topic: webhook deliveries table status attempt count replay debug endpoint
tags: [webhook, retry]
importance: 2
updated: 2026-06-18
---
Inbound webhook deliveries are recorded in the webhook_deliveries table with the endpoint id, event id, status, and attempt count. This gives operators a replay and debugging surface when a provider reports a delivery Helios appears to have missed. Failed async processing increments the attempt count and is retried with backoff.
