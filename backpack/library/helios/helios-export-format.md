---
id: helios-export-format
project: Helios
type: reference
title: Exports are gzipped JSONL
topic: export jsonl gzip tenant partition table format schema
tags: [export, format]
importance: 2
updated: 2026-06-18
---
Tenant exports are emitted as gzipped JSONL — one JSON object per line — partitioned into one file per source table. JSONL keeps exports streamable to write and trivial to re-import line by line. Each file carries a header object describing the table and schema version.
