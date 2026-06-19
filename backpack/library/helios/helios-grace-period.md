---
id: helios-grace-period
project: Helios
type: constraint
title: 7-day grace period; suspension never deletes data
topic: grace period suspend tenant access flag data retention dunning delete past_due
tags: [dunning, suspend, retention]
importance: 4
updated: 2026-06-18
---
A past_due subscription is not cut off immediately. The tenant keeps full access during a 7-day grace period measured from the first failed charge, giving dunning time to recover the payment. Only after the grace period elapses without a successful payment is access suspended. Suspension never hard-deletes tenant data — it flips an access flag (tenant.suspended_at) and nothing else, so a tenant who pays late is restored instantly. Re-enabling access is a flag flip, not a restore.
