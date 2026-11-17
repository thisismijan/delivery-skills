## Why

Repeated paired evaluation treats a median ratio within 0.05 of the 90 percent
bar as a close call. That margin is a choice, not a measurement, and the
per-run utilities were thrown away after each decision, so it could never be
set from evidence.

## What Changes

- `paired-spread.ts record <paired-evidence.json> <task-class> <paired-runs.jsonl>`
  appends each run's baseline and candidate utilities and the decision. The
  improve workflow runs it after every evaluation that decides or extends,
  into `<state root>/routing/paired-runs.jsonl`.
- `paired-spread.ts report <paired-runs.jsonl>` shows, per task class:
  - how far one run's ratio strayed from its evaluation's median ratio;
  - how many evaluations the current margin extended;
  - the smallest margin, rounded up to 0.01, that a single run's observed
    deviation could not carry across the bar.
- It reports `none` without records and never changes the margin. Records go
  to their own file because the evaluation corpus schema is for routing
  evidence.

Out of scope: changing the margin or the bar, and evaluations recorded before
this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `paired-skill-evaluation`: run-to-run spread is recorded and reported
  against the close-call margin.

## Impact

`factory/scripts/paired-spread.ts` and its tests,
`skills/delivery/workflows/improve.md`, and `docs/reference.md`.
