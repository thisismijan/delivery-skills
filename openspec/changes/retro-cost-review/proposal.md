## Why

The retro reconstructed the engineering story and the corrections, but said
nothing about where the run's tokens went or where a run could cost less.
Measured usage exists only when diagnostic profiling is on, and nothing
pointed at the cost drivers every run leaves behind.

## What Changes

- `cost-review.ts <repoRoot> <ledger.md>` reports, for every key in the ledger:
  - measured tokens and cost when the run recorded them, ranked by stage, kind
    of work, and model tier, with shares;
  - the cost drivers: review rounds, review lens runs, focused passes, green
    gate attempts, the largest subagent packet, and workers scripts avoided.
- It flags savings to consider, each with evidence:
  - three or more review rounds;
  - three or more green gate runs;
  - a packet of 60,000 characters or more;
  - one kind of work holding half the measured tokens;
  - cheaper shadow recommendations with no safety floor;
  - an unmeasured run, with how to measure one.
  It never estimates a token figure.
- The retro gains step 11, "Review token cost", before Present. Savings go
  through the same proof as other proposals. They may make a step cheaper but
  never remove or weaken a gate, a review, a holdout, or a quality check, and a
  cheaper model needs a paired benchmark first.
- Each finding presented becomes a Lessons line with its decision.

## Capabilities

### New Capabilities

- `retro-cost-review`: the retro shows where tokens went and which savings are
  worth considering.

### Modified Capabilities

None.

## Impact

`factory/scripts/cost-review.ts` and its tests,
`skills/delivery/workflows/retro.md`, `docs/reference.md`, and the README.
