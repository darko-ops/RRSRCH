---
id: helios-old-basic-auth
project: Helios
type: decision
title: (OLD) HTTP Basic shared-secret auth
topic: basic auth legacy shared secret api key authentication superseded plaintext
tags: [auth, legacy]
importance: 2
stale: true
updated: 2026-06-18
---
Superseded. Customers once authenticated with HTTP Basic using a shared secret stored in plaintext. There was no rotation and the secret was occasionally logged. It was replaced by SHA-256-hashed API keys with overlap-window rotation. Kept for history; do not build on this.
