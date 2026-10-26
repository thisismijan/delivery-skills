## Why

Delivery picks one model for a whole implement step. A rename or import-only
fix therefore pays the standard tier even when the work is local, reversible,
and strongly verified. Cheaper models exist in the catalogue, but live
implement is locked off them, and a worker must not decide that its own job
is menial.

## What Changes

- Add a first-class mechanical-edit unit with a structured payload (operation,
  identifiers, files). Free-text review findings are not enough.
- Classify that unit with a deterministic, fail-closed helper in the same
  style as review fan-out. Incomplete or unknown input is not mechanical.
- Prefer a scripted apply for identifier rename, import-only, and format-only
  work when the language can prove the patch is rename-equivalent.
- Treat a classified mechanical-edit as fast-eligible for shadow routing and
  later graduation. Do not dispatch a fast catalogue model live in this
  change.
- Record the classification on comment-fix and execute paths. Unclassified
  work keeps today's Sonnet or frontier worker.
- Holdout still ignores naming nits. Address-comments still disputes
  nitpicks without a code change. This change does not create mechanical
  work from style comments.

## Capabilities

### New Capabilities

- `mechanical-edit-classification`: structured mechanical-edit units and a
  deterministic classifier that never lets the worker choose its own tier.

### Modified Capabilities

- `fast-model-graduation`: a classified mechanical-edit that is local,
  reversible, known-pattern, and strongly verified may count as fast-eligible
  work. Auth, migration, concurrency, distributed-state, weak verification,
  and holdout floors still block. Live availability still needs representative
  scores, the 90 percent bar, and an exact promotion approval.

## Impact

- `factory/scripts/mechanical-edit.ts` (new classifier).
- `factory/scripts/shadow-route.ts` and `task-profile.ts`: mechanical-edit
  work type and eligibility.
- Execute and address-comments: classify before a fix dispatch; live worker
  remains `select-model.ts` until a later promotion.
- Catalogue, holdout, and fast-dispatch promotion rules stay as they are.
- README / runtime docs: mechanical units are classified, not self-assigned.
