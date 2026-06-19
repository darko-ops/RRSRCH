---
id: helios-old-hourly-rollup
project: Helios
type: decision
title: (OLD) Hourly sum-from-scratch rollup
topic: usage rollup hourly sum legacy billing aggregate superseded
tags: [usage, rollup, legacy]
importance: 2
stale: true
updated: 2026-06-18
---
Superseded. Usage was originally rolled up once an hour by summing every event whose event_time fell in that hour. That design double-billed whenever a rollup run was retried after a partial failure, and it could not absorb late events. It was replaced by the watermark-based idempotent rollup. Kept for history; do not build on this.
