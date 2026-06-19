---
id: helios-key-hash
project: Helios
type: warning
title: Store only SHA-256 hash of API keys
topic: api key hash sha256 storage prefix raw secret rotation once
tags: [apikey, security, hash]
importance: 5
updated: 2026-06-18
---
Customer API keys are never stored or logged in raw form. At creation the raw key is returned to the customer exactly once, and only its SHA-256 hash is persisted, alongside an 8-character non-secret display prefix used to identify the key in the dashboard. Authentication hashes the presented key and looks up the hash. Because the raw value is unrecoverable, a lost key can only be rotated, not retrieved. Never write a raw key into logs, traces, or error messages.
