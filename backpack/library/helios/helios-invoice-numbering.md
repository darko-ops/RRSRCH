---
id: helios-invoice-numbering
project: Helios
type: decision
title: Gapless sequential invoice numbers
topic: invoice number sequential gapless per-tenant counter billing transaction audit
tags: [invoice, billing]
importance: 3
updated: 2026-06-18
---
Invoice numbers are gapless and strictly sequential per tenant. They are allocated from a dedicated per-tenant counter table inside the same database transaction that writes the invoice, so a rolled-back invoice never burns a number. Gapless numbering is a finance and audit requirement in several jurisdictions Helios operates in.
