---
id: over-always-a
project: CapTest
type: warning
title: Oversized do-not-break item A
topic: cap test always reserved overflow guarantee
tags: [test, cap]
importance: 5
always: true
updated: 2026-06-18
---
This item exists only to prove the always-cap lint bites. Marking many large
items as do-not-break would let reserved content consume the entire Brief tier,
turning the safety guarantee into the very context-flood the product exists to
prevent. The cap makes over-flagging a build failure instead of a silent
overflow, so a library author is forced to choose what truly must never break.
Padding to ensure the three always items together exceed the Brief ceiling of
four hundred tokens when summed by the same char-over-four estimator the packer
uses to reserve them, which guarantees this fixture trips the lint reliably.
