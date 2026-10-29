## Why

Every run spends the same way. A small, low-risk ticket gets the same
parallelism, repair budget, and review rounds as a large one the operator
wants done fast. The knobs exist (`MAX_PARALLEL_WORKTREES`, `MAX_FIX_ATTEMPTS`,
review fan-out, model selection), but they are separate environment variables
that nothing records, so a run's cost profile cannot be chosen in one word or
read back afterwards.

## What Changes

- New levels `min`, `standard`, and `max`, typed as one word after the verb
  or as the first word: `/delivery auto max MDF-1234`, `/delivery min
  MDF-5678`. `standard` is exactly today's behaviour.
- New `factory/scripts/levels.ts` holds the presets. A level sets:
  - workers at once: 2, 4, or 8;
  - fix attempts: 1, 2, or 3;
  - review rounds before auto stops: 2, 3, or 4 (new `MAX_REVIEW_ROUNDS`);
  - review breadth: at `min`, size alone never adds lenses; at `max`, every
    review and readiness lens runs on every change;
  - the implementer: frontier at `max`.
- `config.ts` reads `DELIVERY_LEVEL`. An explicit variable still wins for its
  knob and is listed under `overrides`.
- The level is frozen in the run contract as `level`. A contract without one
  runs as `standard`, so runs in progress need no new approval. The new
  `sdlc-constitution.ts level` command stops a run whose invocation asks for
  a different level until a superseding plan is approved.
- Workers, including sandboxed ones, get `DELIVERY_LEVEL`.
- No level changes:
  - holdout review, the review chain, or the frontier reviewer;
  - every lens on a sensitive, dependency, one-way, or partly classified change;
  - release-readiness lenses or the land gate;
  - fast-model evaluation, or any human-owned decision.

## Capabilities

### New Capabilities

- `delivery-levels`: one-word cost, speed, and depth presets for a run.

### Modified Capabilities

None.

## Impact

- New `factory/scripts/levels.ts` and its test; `config.ts`,
  `review-fanout.ts`, `select-model.ts`, `next-action.ts`,
  `sdlc-constitution.ts`, `sandbox-run.ts`
- `skills/delivery/SKILL.md`, `skills/delivery/workflows/auto.md`,
  `skills/execute/SKILL.md`, `skills/code-review-max/SKILL.md`,
  `factory/agents/implementer*.md`, `factory/CONVENTIONS.md`, `docs/reference.md`
