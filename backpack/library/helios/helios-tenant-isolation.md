---
id: helios-tenant-isolation
project: Helios
type: constraint
title: Every query/export filtered by tenant_id (RLS)
topic: tenant isolation row level security export query multi-tenant cross filter leak
tags: [tenant, isolation, security]
importance: 5
updated: 2026-06-18
---
Helios is multi-tenant and every data access must be scoped to a single tenant. Every query and every export must filter by tenant_id, and Postgres row-level security enforces this at the database layer as a backstop so a missing application-level filter cannot leak across tenants. Cross-tenant reads are never permitted, including in batch jobs and exports. Connection sessions set the current tenant via a session variable the RLS policies read. Treat any code path that can return another tenant’s rows as a security incident.
