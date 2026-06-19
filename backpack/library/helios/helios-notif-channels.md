---
id: helios-notif-channels
project: Helios
type: reference
title: Email/SMS/in-app notification channels
topic: notification channels email sms postmark twilio in-app websockets delivery
tags: [notification, channels]
importance: 2
updated: 2026-06-18
---
Notifications are delivered over three channels: transactional email via Postmark, SMS via Twilio, and in-app messages over websockets. The notifications service chooses channels based on tenant preferences and message type, and records delivery status per channel.
