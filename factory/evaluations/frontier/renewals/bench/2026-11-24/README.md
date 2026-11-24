# Model benchmark: renewals fixture, 2026-11-24

Every model from the webhook benchmark, three runs each, on the renewals
fixture in `../../fixture`. Runs started together at 06:46 UTC. The fixture,
answer key, and rubric were pushed at `ac48aaa` before any run, and the judge
prompts were generated from `f691fd3`.

Gaps were judged by Claude Opus 5.5 high. GPT-5.6 Sol high judged every answer
too, as a check. Both passed every label in the calibration set first
(`judges/`). They agreed on 358 of 360 gap decisions. Each
model was compared with Opus 5.5 high by `paired-evaluation.ts`, run by run.

"Missed most" counts runs per check, leaving out runs that broke the output contract: month end (31 January becomes 3 March),
unpaid renewal (`requires_action` renews), repeated key (the retry returns the
stored decline), paused months (a resumed subscription is charged for them),
the two decoys, and the real review findings (text sort, March days, text compare).

| Model | Score | Runs with every check | Critical misses | Median time | Missed most | Paired evaluation |
|---|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 100% | 3 of 3 | 0 | 44 s | none | pass |
| GPT-5.6 Sol | 100% | 3 of 3 | 0 | 48 s | none | pass |
| Claude Opus 5.5 (baseline) | 100% | 3 of 3 | 0 | 60 s | none | baseline |
| Kimi K3 | 100% | 3 of 3 | 0 | 72 s | none | pass |
| Muse Spark 1.3 | 100% | 3 of 3 | 0 | 80 s | none | pass |
| Claude Opus 4.7 | 100% | 3 of 3 | 0 | 114 s | none | pass |
| Gemini 4 Neon | 100% | 3 of 3 | 0 | 226 s | none | pass |
| Gemini 4 Neon (xhigh) | 100% | 3 of 3 | 0 | 362 s | none | pass |
| Gemini 4 Carbon | 100% | 3 of 3 | 0 | 531 s | none | pass |
| Claude Opus 4.6 | 98% | 2 of 3 | 1 | 91 s | paused months (1) | fail |
| Muse Wonder 1.0 | 96% | 1 of 3 | 0 | 125 s | crash decoy (2) | fail |
| Gemini 3.1 Pro | 96% | 1 of 3 | 2 | 118 s | month end (2) | fail |
| Composer 2.5 | 93% | 0 of 3 | 3 | 35 s | repeated key (2), unpaid renewal (1) | fail |
| Kimi K2.7 Code | 93% | 0 of 3 | 3 | 186 s | repeated key (3) | fail |
| Grok 4.5 | 91% | 2 of 3 | 4 | 128 s | repeated key (1), paused months (1), unpaid renewal (1) | fail |
| Grok 4.6 | 91% | 2 of 3 | 4 | 160 s | repeated key (1), paused months (1), unpaid renewal (1) | fail |
| GPT-5.6 Terra | 84% | 1 of 3 | 7 | 46 s | paused months (2), unpaid renewal (2), month end (2) | fail |
| GPT-5.6 Luna | 71% | 0 of 3 | 12 | 108 s | repeated key (3), paused months (3), unpaid renewal (3) | fail |
| Claude Opus 4.8 | 63% | 0 of 3 | 9 | 193 s | format (1); then month end (2) | fail |
| GLM 5.2 | 60% | 1 of 3 | 9 | 58 s | format (1); then March days (1), text sort (1) | fail |

## Reading it

- **The fixture separates the field.** Nine models passed every check on every
  run. The other eleven missed something. On the webhook fixture, fifteen tied
  at full marks.
- **The repeated idempotency key is the hardest gap.** It was missed by Kimi
  K2.7 Code on every run, by Composer 2.5 on two runs, and by GPT-5.6 Luna on
  every run. Finding it means connecting the design's retry rule, the key's
  shape, and a sentence in the gateway's documentation.
- **GLM 5.2 broke the output contract on one run.** Of the two runs that kept
  it, one rejected the real text-sort and March-days review findings.
- **Opus 4.8 broke the output contract again**, on one of three runs. Both
  runs that kept it missed the month-end overflow.
- **GPT-5.6 Luna and Terra were fast but shallow** on this fixture.
- **Time.** Among the models with every check passed, Sonnet 5.5, GPT-5.6 Sol
  and Opus 5.5 took under a minute per run. Gemini 4 Carbon took about nine.
- **Limits.**
  - One fixture, three runs per model.
  - The gap checks rest on a judge, calibrated but not infallible. The second
    judge disagreed on two decisions, both about the crash decoy.
  - Cost was not measured.
