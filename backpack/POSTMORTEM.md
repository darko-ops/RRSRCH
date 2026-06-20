# Postmortem — RRSRCH "backpack" (context-pack engine)

**Status:** parked, 2026-06-19. Code and eval intact and reproducible.
**One line:** built a token-efficient, safety-guaranteed context-pack engine; the
judged kill-switch failed to show the *quality* edge the thesis was built on, so we
banked the finding instead of chasing it.

## The thesis

Agents fail two ways — too little context (dumb assumptions) or too much (drown,
lost-in-the-middle). RRSRCH would hand each task the *minimum useful* pack. The bet
that justified building it: **more context degrades the agent**, so a small
structured pack would *beat* a big dump on **task-success** — a quality moat, not
just a token discount.

## What we built (Phases 0–4)

A deterministic, dependency-light core, each phase gated by an eval harness:

- **Engine:** budget-aware packing, `always` do-not-break reservation (capped),
  supersession, graph-relatedness boost, two-pass compression.
- **Surfaces:** MCP server, CLI, zero-dep HTTP API.
- **Authoring:** `remember()` write-back; deterministic repo ingestion → quarantined
  review queue (`extract`/`review`/`accept`).
- **Safety:** the always-cap lint, must-not-leak gate, and a secret-redaction
  guarantee — none of which depend on the thesis being true.
- **Eval:** golden set + 3-arm experiment (dump / naive / pack), 28 unit tests.

## The test

The project's own kill-switch: have a solver consume each arm's context and an LLM
judge score the result against a fixed rubric, blind to arm.

- **pack > naive on task-success** → the moat is *structure*, not truncation.
- **pack ≥ dump at far fewer tokens** → "less is more" is *quality*, not a discount.

## The result (N=5 Helios cases · solver gpt-4o-mini · judge gpt-4o · temp 0)

| arm | task-success | mean tokens |
|---|---|---|
| dump | 88% | 3192 |
| naive | 88% | 2241 |
| pack | 85% | 1798 |

pack came in **−2.5 pts vs naive**. This is *failed to demonstrate*, not *disproven*
(N=5 + LLM-judge variance) — but it trips the kill-switch on the quality thesis.
pack matched a full dump's success at ~56% of the tokens.

## Verdict

The **quality wedge did not appear**. What the data supports is an **efficiency +
safety** wedge: equal task-success at far fewer tokens, plus the do-not-break /
no-leakage / redaction guarantees. That is a *feature*, not a *moat*.

We chose not to chase it:

- **Tuning the two breadth losses** (h1, h5) would likely flip N=5 — but that edge
  shrinks every time long-context models improve. Winning a battle on a
  trend-doomed front.
- **Re-running with a stronger judge** (Claude) would more cleanly handle bloat and
  bury the thesis deeper, not rescue it. A small model absorbing the dump is
  evidence *for* the null, not noise.

## What went right

- **Eval before cleverness.** Every retrieval change moved a measured number; no
  feature shipped on vibes. The harness is what let the thesis fail *cheaply and
  legibly* instead of after a launch.
- **The guarantees were decoupled from the bet.** Redaction, the always-cap, and
  no-leakage are correct and useful regardless of the quality claim.
- **The kill-switch was real.** It tripped, and we listened.

## What we'd do differently

- **Run the gate first.** We built Phases 1–4 ahead of the judged kill-switch (it
  was key-gated and deferred), so it tripped *retroactively*. The gate exists to
  decide whether to build — running it last inverted that. Cheap to fix next time:
  treat a key-gated gate as a blocker, or stub it earlier.
- **Watch the label/outcome gap.** pack had 100% recall on the labelled `must_have`
  set yet lost on task-success — the labels didn't capture what the rubric needed.
  `recall@budget` was a comforting proxy that didn't track the metric that mattered.
- **Pick the wedge against the trend, not with it.** A context-efficiency edge is
  exactly what improving long-context models erode.

## What's reusable

The deterministic, eval-gated engine; the secret-redaction guarantee; the
ingestion → review-queue pattern; and the harness discipline itself. Re-run the
verdict any time with `npm run experiment`.
