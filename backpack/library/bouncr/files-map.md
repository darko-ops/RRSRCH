---
id: files-map
project: Bouncr
type: file
title: Files likely involved in Stripe Connect onboarding
topic: stripe connect onboarding webhook files codebase
tags: [stripe, connect, onboarding, files]
importance: 3
files: [/api/stripe/connect/*, /api/webhooks/stripe, /lib/stripe.ts, /db/schema.sql]
updated: 2026-05-21
---
Merchant onboarding work tends to touch the Connect API routes, the Stripe
webhook handler, the shared Stripe client, and the database schema.
