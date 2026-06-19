---
id: helios-refunds
project: Helios
type: constraint
title: Refunds reference the original payment intent
topic: refund full partial original charge payment intent billing captured audit
tags: [refund, billing]
importance: 3
updated: 2026-06-18
---
Refunds are issued as full or partial amounts against the original charge and must reference the original payment intent. A refund never exceeds the captured amount, and partial refunds may be issued repeatedly up to that total. Refunds are themselves billing mutations and are audited.
