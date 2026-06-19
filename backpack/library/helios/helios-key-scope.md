---
id: helios-key-scope
project: Helios
type: reference
title: API keys are tenant-scoped
topic: api key scope tenant permission cross-tenant read write
tags: [apikey, scope]
importance: 3
updated: 2026-06-18
---
Every API key is scoped to exactly one tenant and a set of permission scopes that bound what the key may do. Cross-tenant keys do not exist. Scopes are checked on every request after authentication, so a key limited to read scopes cannot perform billing mutations.
