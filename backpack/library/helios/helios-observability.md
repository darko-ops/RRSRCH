---
id: helios-observability
project: Helios
type: reference
title: OpenTelemetry traces and metrics
topic: observability opentelemetry traces metrics collector logs trace id
tags: [observability, otel]
importance: 2
updated: 2026-06-18
---
All services emit OpenTelemetry traces and metrics to a central collector, with trace context propagated across the event bus. Dashboards and alerts are built on these signals. Logs are structured JSON and correlated to traces by trace id.
