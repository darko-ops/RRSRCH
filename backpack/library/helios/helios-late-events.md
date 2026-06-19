---
id: helios-late-events
project: Helios
type: constraint
title: Late usage events reopen the period (72h window)
topic: late usage events 72 hours window reopen period rollup aggregate dropped
tags: [usage, events, billing]
importance: 4
updated: 2026-06-18
---
Usage events can legitimately arrive up to 72 hours after their event_time, because customer agents buffer and retry. The rollup must treat a billing period as provisionally closed, not final: when a late event lands inside the 72-hour window, reopen the affected period and re-aggregate it rather than dropping the event. Events older than 72 hours are rejected at ingest and counted in a late_dropped metric. Periods finalize only once the 72-hour window has fully elapsed. This is why rollups are watermark-driven and idempotent.
