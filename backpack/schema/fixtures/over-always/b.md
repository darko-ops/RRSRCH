---
id: over-always-b
project: CapTest
type: warning
title: Oversized do-not-break item B
topic: cap test always reserved overflow guarantee
tags: [test, cap]
importance: 5
always: true
updated: 2026-06-18
---
Second oversized do-not-break item. The point of three of these in one project
is to push the summed reserved-token count past the Brief-tier ceiling so the
validator must reject the library. If reserved items could grow without bound,
the knapsack packer would have no room left to be selective and every pack would
degrade into a flood of everything-someone-once-thought-important. Padding here
keeps the body large enough that A, B and C together clear four hundred tokens
under the char-over-four heuristic, making the failure deterministic in CI.
