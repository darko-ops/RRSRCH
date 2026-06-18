---
id: secret-key-warning
project: Bouncr
type: warning
title: Never expose the platform secret key client-side
topic: stripe secret key security client server keys
tags: [stripe, security, keys]
importance: 5
always: true
updated: 2026-05-21
---
Do not expose the platform Stripe secret key client-side. Only the publishable
key may reach the browser; all secret-key calls stay on the server.
