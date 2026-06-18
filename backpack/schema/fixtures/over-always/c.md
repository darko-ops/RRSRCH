---
id: over-always-c
project: CapTest
type: warning
title: Oversized do-not-break item C
topic: cap test always reserved overflow guarantee
tags: [test, cap]
importance: 5
always: true
updated: 2026-06-18
---
Third oversized do-not-break item. With A and B this pushes the CapTest project's
reserved budget past the Brief ceiling, so `node schema/validate.mjs
schema/fixtures/over-always` MUST exit non-zero. That non-zero exit is the test:
it proves the always-cap is a real, enforced guarantee and not documentation.
More padding so the summed estimate is comfortably above four hundred tokens and
the lint never flakes between runs regardless of minor wording changes upstream.
