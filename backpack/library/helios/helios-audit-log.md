---
id: helios-audit-log
project: Helios
type: reference
title: Append-only audit log
topic: audit log append-only mutation actor tenant compliance before after
tags: [audit, compliance]
importance: 3
updated: 2026-06-18
---
Every state mutation writes an append-only audit log entry capturing the actor, the tenant, the action, and a before/after summary. The audit log is immutable and retained for compliance. It is the system of record for who changed what and when.
