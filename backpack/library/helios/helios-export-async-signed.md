---
id: helios-export-async-signed
project: Helios
type: decision
title: Exports run async, delivered via 1h signed URL
topic: tenant data export async signed url expiry 1 hour gdpr stream object storage
tags: [export, async, gdpr]
importance: 4
supersedes: [helios-old-sync-export]
updated: 2026-06-18
---
Tenant data exports are asynchronous. A request enqueues an export job and returns a job id; the worker assembles the export, uploads it to object storage, and the tenant downloads it through a signed URL that expires after 1 hour. Never stream a full export synchronously inside the request — exports can be large and the request would time out, and a long-lived public link would be a data-leak risk. The signed URL is single-tenant-scoped and short-lived by design. Completed exports are deleted from storage after 7 days.
