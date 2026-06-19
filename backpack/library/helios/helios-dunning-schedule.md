---
id: helios-dunning-schedule
project: Helios
type: decision
title: Dunning retries on days 1/3/5/7, max 4
topic: failed payment dunning retry schedule days attempts past_due email recurring
tags: [dunning, retry, billing]
importance: 5
supersedes: [helios-old-charges-retry]
updated: 2026-06-18
---
When a recurring payment fails, Helios retries it on a fixed schedule: day 1, day 3, day 5, and day 7 after the first failure, for a maximum of 4 attempts. Each retry is a fresh charge against the saved payment method. If the day-7 attempt also fails, stop retrying, send the final dunning email from the notifications service, and flag the subscription past_due. Do not retry more often or more times than this — the old every-12-hours-for-8-attempts behavior was retired. A successful retry at any step clears past_due.
