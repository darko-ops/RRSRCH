---
id: helios-no-pii-in-logs
project: Helios
type: warning
title: Never log raw PII or secrets
topic: logging pii email api key secret hash redaction sha256
tags: [security, logging, pii]
importance: 5
always: true
updated: 2026-06-18
---
Never write raw customer email addresses, API keys, or card data into logs or traces. Hash any identifier you must log with SHA-256 and emit only the first 8 characters of the digest.
