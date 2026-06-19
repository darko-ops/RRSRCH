---
id: helios-event-bus
project: Helios
type: reference
title: Internal event bus on NATS
topic: event bus nats subjects internal services messaging decoupled domain
tags: [events, nats]
importance: 2
updated: 2026-06-18
---
Internal Helios services communicate over a NATS-based event bus using subject names namespaced by domain (billing.*, usage.*, notifications.*). Producers publish domain events; consumers subscribe to the subjects they care about. This keeps services decoupled from each other’s databases.
