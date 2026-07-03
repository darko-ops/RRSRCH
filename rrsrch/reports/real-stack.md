# rrsrch — real-stack numbers

*Generated 2026-07-02 17:19 UTC by `scripts/real_stack_report.py` from actual runs on
Postgres 16 + pgvector 0.8.4 (Docker) and all-MiniLM-L6-v2 (local, Apple M2).
Nothing below is simulated except where labeled as the offline floor.*

## 1. Matching: hash floor vs MiniLM (tuned)

### Offline floor — hash embedder, in-memory store
```
============================================================
embedder=hash  store=memory  similarity_threshold=0.42
============================================================
1. paraphrase hit rate : 86.7%  (26/30; wrong-topic serves: 0)
2. scope false-hit rate: 0.0%  (0/10)
3. warm hit cost       : 30 tok = 0.03% of cold (90000)
4. intent false-hits   : 0/16  (guard rejected 16/16 flips)
5. intent-preserving   : 8/8 hit  (guard wrongly blocked: 0)

EXIT CRITERIA
  [PASS] paraphrases hit at high rate (>=80%)
  [PASS] scope near-misses / wrong topics do NOT serve
  [PASS] warm hit < 10% of cold path
  [PASS] intent flips do NOT serve (false-hit = 0)
  [PASS] guard blocks no intent-preserving paraphrase

✓ EVAL PASSED
```

### Real — MiniLM on Postgres, threshold sweep + knee
```
threshold sweep 0.35→0.95 (step 0.025)  embedder=minilm store=postgres
threshold | paraphrase hits | scope false-hits | wrong-topic
     0.35 |           96.7% |             0.0% |           1
     0.38 |           96.7% |             0.0% |           1
     0.40 |           96.7% |             0.0% |           0
     0.42 |           96.7% |             0.0% |           0
     0.45 |           96.7% |             0.0% |           0
     0.47 |           96.7% |             0.0% |           0
     0.50 |           96.7% |             0.0% |           0
     0.53 |           96.7% |             0.0% |           0
     0.55 |           93.3% |             0.0% |           0
     0.57 |           90.0% |             0.0% |           0
     0.60 |           86.7% |             0.0% |           0
     0.62 |           80.0% |             0.0% |           0
     0.65 |           80.0% |             0.0% |           0
     0.68 |           76.7% |             0.0% |           0
     0.70 |           73.3% |             0.0% |           0
     0.72 |           66.7% |             0.0% |           0
     0.75 |           46.7% |             0.0% |           0
     0.78 |           36.7% |             0.0% |           0
     0.80 |           33.3% |             0.0% |           0
     0.82 |           16.7% |             0.0% |           0
     0.85 |            3.3% |             0.0% |           0
     0.88 |            3.3% |             0.0% |           0
     0.90 |            0.0% |             0.0% |           0
     0.93 |            0.0% |             0.0% |           0
     0.95 |            0.0% |             0.0% |           0

knee (max hits, false-hits=0, wrong-topic=0, prefer higher): 0.53

============================================================
embedder=minilm  store=postgres  similarity_threshold=0.525
============================================================
1. paraphrase hit rate : 96.7%  (29/30; wrong-topic serves: 0)
2. scope false-hit rate: 0.0%  (0/10)
3. warm hit cost       : 30 tok = 0.03% of cold (90000)
4. intent false-hits   : 0/16  (guard rejected 16/16 flips)
5. intent-preserving   : 8/8 hit  (guard wrongly blocked: 0)

EXIT CRITERIA
  [PASS] paraphrases hit at high rate (>=80%)
  [PASS] scope near-misses / wrong topics do NOT serve
  [PASS] warm hit < 10% of cold path
  [PASS] intent flips do NOT serve (false-hit = 0)
  [PASS] guard blocks no intent-preserving paraphrase

✓ EVAL PASSED
```

**Reading:** MiniLM at the tuned fused threshold beats the hash floor
(the sweep shows the safe plateau; scope false-hits are 0 at EVERY threshold —
the scope hard-gate holds independent of the embedder, which is also pinned by
`tests/test_minilm_integration.py` on the us-east-1/eu-west-1 pair). The residual
paraphrase miss is acronym expansion ("GIL" ↔ "global interpreter lock"),
a model limitation, not a gate bug.

**Intent guard (serve-path false-hit hardening):** rows 4–5 above are the
adversarial same-scope sets. On MiniLM every INTENT-FLIP pair ("require MFA?" vs
"NOT require MFA?", enable/disable, install/remove, increase/decrease,
include/exclude, before/after) clears the similarity threshold — only the
deterministic intent guard stops the wrong answer, and it caught 16/16 with zero
intent-preserving paraphrases blocked. Real rejected-candidate log lines from
`query_events` on this stack:

```
[17:19:53] MISS reason=intent_mismatch query='Does CMMC Level 2 not require MFA?'
           rejected deposit=0af252c1-d368-4584-a2be-6b1be1daf24e rule=polarity_flip similarity=0.9501
           fields={"candidate": {"entities": ["CMMC", "Does", "Level", "MFA"], "negated": false, "numbers": [2.0], "predicates": {"obligation": 1}}, "query": {"entities": ["CMMC", "Does", "Level", "MFA"], "negated": true, "numbers": [2.0], "predicates": {"obligation": 1}}}
[17:19:53] MISS reason=intent_mismatch query='How do I disable S3 bucket versioning?'
           rejected deposit=da8db187-1e78-4d0c-a8d3-79151230110a rule=predicate_flip:activation similarity=0.8761
           fields={"candidate": {"entities": ["How", "S3"], "negated": false, "numbers": [], "predicates": {"activation": 1}}, "query": {"entities": ["How", "S3"], "negated": false, "numbers": [], "predicates": {"activation": -1}}}
```

## 2. One real proof-of-search cycle (live web, no agent, no human)

```

[17:18:40] provider=WebSearchProvider store=postgres embedder=minilm
[17:18:40] deposited OUTDATED claim: 'The latest stable Python 3 release is Python 3.9.0.'
           id=6ec0d04a-cbdf-4769-89b8-027fad5210e6 topic=t-e267bad4598b8d5d volatility=high
[17:18:40] running verify_once() with the REAL provider (live web research — takes a minute)...
[17:19:13] verifier: topic=t-e267bad4598b8d5d outcome=disagreed tokens_spent=4617
[17:19:13] lookup(old deposit):
{
  "found": true,
  "deposit_id": "6ec0d04a-cbdf-4769-89b8-027fad5210e6",
  "retired": true,
  "topic_id": "t-e267bad4598b8d5d",
  "retired_at": "2026-07-02T17:19:13.426069+00:00",
  "superseded_by": "be57b26a-75f8-4a54-9cda-fa59e0844dca",
  "replacement": {
    "deposit_id": "be57b26a-75f8-4a54-9cda-fa59e0844dca",
    "claim": "The latest stable Python 3 release is Python 3.14.6, released on June 10, 2026.",
    "confidence": 1.0,
    "sources": [
      {
        "url": "https://www.python.org/downloads/",
        "title": "Download Python | Python.org",
        "retrieved_at": null
      },
      {
        "url": "https://devguide.python.org/versions/",
        "title": "Status of Python versions",
        "retrieved_at": null
      }
    ]
  }
}
[17:19:13] /recalls since start: [
  {
    "retired_deposit_id": "6ec0d04a-cbdf-4769-89b8-027fad5210e6",
    "superseded_by": "be57b26a-75f8-4a54-9cda-fa59e0844dca",
    "topic_id": "t-e267bad4598b8d5d",
    "retired_at": "2026-07-02T17:19:13.426069Z"
  }
]
[17:19:35] search() now serves: outcome=hit claim='The latest stable Python 3 release is Python 3.14.6, released on June 10, 2026.' confidence=1.0

→ CYCLE COMPLETE: stale claim caught and superseded by live research.
```

## 3. The honest cost line (from the live Postgres metrics)

| metric | value |
|---|---|
| tokens saved by exploiting (warm hits) | 89,914 |
| tokens spent on exploration/verification | 9,180 |
| **net savings** | **80,734** |
| corroborations (agreed / disagreed) | 1 / 1 |
| mean time-to-correction | 0.0 s |

Verification spend counts AGAINST the savings claim — rrsrch pays real tokens to
keep the cache safe, and still nets positive after one warm hit. Every number in
this table comes from `query_events` rows written during the live cycle above.
