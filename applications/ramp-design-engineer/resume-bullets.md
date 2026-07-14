# Ramp — Design Engineer: resume bullets (final framing)

Application form: **portfolio link = demetri.xyz**. The resume space below is
spent on the stronger evidence instead of duplicating the portfolio.

Framing decisions locked in:

1. **AtlasView** leads with the interactive graph (maps directly to Ramp's
   "reveal what agents are doing" language and shows visual/interactive craft);
   the print-ready audit report rides as a secondary clause in the same bullet.
2. **Site + dashboard** is one bullet. The privacy-preserving dashboard
   (Chrome Local Network Access / CORS) is a secondary detail inside the site
   bullet, not its own bullet — it's a systems story, and the space goes to
   AtlasView and the engine story instead.
3. **Two measured claims on the resume:** the trust-system numbers
   (0 of 19 poison claims served, precision 0.989, 400-query simulated fleet —
   sourced from `rrsrch/README.md` / `rrsrch/reports/multi-agent.md`) and the
   eval-discipline story (1,195-pair blind-labeled eval set; cross-encoder
   reranker lost to a simple threshold and ships default-off). The
   self-verification token economics (~4.9k tokens spent to protect ~85k of
   downstream reuse) stays OFF the resume — it's an interview story; it takes
   too many words to land in a bullet.

---

## The bullets

**AtlasView — infrastructure truth graph** *(design + engineering, solo)*

- Designed and built an interactive infrastructure graph that classifies every
  edge as confirmed, phantom, shadow, hypothesis, or undecidable — each verdict
  clickable through to its evidence — on a hand-rolled deterministic
  force-directed SVG layout grounded in graph-readability HCI research; the
  same classification logic also ships as a print-ready one-page audit report.

**RRSRCH — self-verifying research memory for AI agents** *(founder; product,
engine, and site, solo)* — rrsrch.com

- Built a multi-agent trust system where per-agent credibility is a pure
  function of independently recorded corroboration outcomes — no LLM in any
  scoring path; with 40% hostile traffic on a 400-query simulated fleet,
  0 of 19 poisoned claims were ever served (precision 0.989).
- Enforced one inviolable rule across the engine: confidence, serve decisions,
  and trust verdicts are deterministic, auditable code — LLMs distill sources
  and extract fields but never compute a score — with a self-verification loop
  that catches stale answers with no agent or human involved.
- Built a 1,195-pair blind-labeled eval set for the retrieval matcher and let
  it decide what ships: when a cross-encoder reranker couldn't beat a simple
  threshold, it shipped default-off.
- Designed and shipped rrsrch.com end to end — product repositioning,
  hash-routed layout, 3D hero, account system, and device-pairing flow —
  including a privacy-preserving live dashboard that streams local telemetry
  into the hosted page (working through Chrome's Local Network Access and CORS
  constraints).

---

## Interview-story bench (not on the resume)

- **Self-verification economics:** ~4.9k tokens spent on verification to
  protect ~85k tokens of downstream reuse — the economic argument for
  verification, told with the budget-steering bandit
  (`rrsrch/src/rrsrch/exploration.py`).
- **Live proof-of-search:** one real cycle caught an outdated claim and
  superseded it with cited fresh research in 34s, no agent, no human
  (`rrsrch/reports/real-stack.md`).
- **Double-negation attacker:** the poison class that used to win, and the
  scoped-effective-polarity fix that contained it 0/11
  (`rrsrch/reports/multi-agent.md`).
