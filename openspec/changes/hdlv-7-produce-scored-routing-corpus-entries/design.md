## Context

`corpusEntryFrom` in `factory/scripts/evaluation-corpus.ts` already accepts an optional `evaluation` (candidate model, relative utility 0 to 1, critical misses), but nothing produces one. `RoutingObservation.source` already distinguishes `live` from `representative-run`. The `record-routing persist` command line substitutes a successful outcome (`gatesPassed: true`, `terminal: "continue"`) when no outcome file is given, so missing evidence is stored as success.

## Goals / Non-Goals

**Goals:**
- Score an observation for one exact candidate and task class.
- Report live and representative-run evidence separately.
- Refuse to persist an observation without an explicit, validated outcome.

**Non-Goals:**
- Computing utility or critical misses from raw model output. The scorer receives them as supplied, measured inputs.
- Enabling a fast model for live work, or changing the 90 percent quality bar.

## Decisions

- **Task class is the observation's `workType`.** The ticket does not define it. `workType` is already on every corpus entry, and the evaluation stores it so a score is keyed to candidate and class. The field is additive and optional on read, so older corpus files still parse.
- **Evidence source is `observation.source`.** `live` is live evidence. `representative-run` is synthetic. The report keys on the recorded value and never infers it.
- **Scoring input** is a candidate result `{ candidateModel, relativeUtility, criticalMisses }`, validated by the same bounds as the existing evaluation schema.
- **Outcome is required at the persistence boundary.** `buildObservation` and `persistObservation` take a validated `CurrentOutcome`. The command line exits nonzero when the outcome file is absent or invalid. There is no default.

## Approved test seams

The operator approved two pure seams, plus the existing persistence write boundary.

1. `scoreCandidate(observation, candidateResult)` returns the corpus entry with the evaluation. Pure.
2. `buildPromotionReport(entries)` groups by exact candidate, task class (`workType`) and source. Pure.
3. `persistObservation` and `buildObservation` stay the single write boundary, exercised against a temporary directory.

**What the seams catch:**
- A score recorded against the wrong candidate or task class; two candidates on one observation must stay distinct.
- Utility outside 0 to 1, or a negative or fractional miss count.
- Live and representative entries pooled, or one source dropped from the report.
- A missing outcome persisted as success, through the function or the command line.
- Older corpus entries without a task class failing to parse.

**What the seams miss:**
- Whether the supplied utility and critical-miss numbers are meaningful.
- Real model behaviour and live usage figures.
- Whether every skill and runner passes a real outcome. That is covered by auditing callers, not by these seams.

**Controlled fakes:** fixed-shape observations built with `buildObservation` with a fixed `recordedAt` and an explicit `source`; hand-written candidate result objects with fixed utility and misses; a temporary directory per test as the routing root. No network, models, clock or randomness.

## Risks / Trade-offs

- Making the outcome required breaks callers that omitted it. Mitigation: audit `representative-routing-runs.ts`, the skills and the tests, and supply explicit outcomes.
- Mislabelled synthetic evidence. Mitigation: report on the recorded source only.
- Older corpus files. Mitigation: the task class is optional on read.
