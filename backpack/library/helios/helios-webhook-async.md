---
id: helios-webhook-async
project: Helios
type: decision
title: Acknowledge webhooks 200 immediately, process async
topic: webhook async queue acknowledge 200 immediately processing inline block
tags: [webhook, async, queue]
importance: 4
supersedes: [helios-old-webhook-inline]
updated: 2026-06-18
---
Webhook endpoints do the minimum synchronously: verify the signature, persist the raw event, and return HTTP 200 immediately. All downstream work — updating subscriptions, issuing credits, sending notifications — happens asynchronously off a queue keyed by the stored event id. Never process a webhook inline in the request handler or block the 200 on downstream calls; providers treat a slow response as a failure and retry, causing duplicate work. The async worker owns idempotency and retries.
