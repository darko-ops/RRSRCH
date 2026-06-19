---
id: helios-currency-minor-units
project: Helios
type: constraint
title: Money stored as integer minor units
topic: currency money minor units integer cents float billing rounding
tags: [money, currency]
importance: 3
updated: 2026-06-18
---
All monetary amounts are stored as integers in the currency’s minor units (for example, cents) with an explicit ISO currency code alongside. Floating-point money is never used anywhere in the billing path, to avoid rounding drift. Conversions and display formatting happen only at the presentation edge.
