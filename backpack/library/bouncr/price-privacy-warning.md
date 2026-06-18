---
id: price-privacy-warning
project: Bouncr
type: warning
title: Never let the LLM see floor_price or target_price
topic: floor price target price policy engine privacy deal
tags: [privacy, pricing, llm, policy]
importance: 5
always: true
updated: 2026-06-01
---
Do not let the LLM see floor_price or target_price. Checkout should only happen
after the policy engine accepts the deal — the model negotiates without ever
reading the reserve numbers.
