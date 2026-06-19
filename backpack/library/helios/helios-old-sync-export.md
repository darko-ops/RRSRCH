---
id: helios-old-sync-export
project: Helios
type: decision
title: (OLD) Synchronous in-request export
topic: export sync synchronous streaming legacy tenant request superseded memory
tags: [export, legacy]
importance: 2
stale: true
updated: 2026-06-18
---
Superseded. Data exports once streamed synchronously inside the request, assembling the whole export in memory before responding. Large exports timed out and held connections open for minutes. It was replaced by async exports delivered via expiring signed URLs. Kept for history; do not build on this.
