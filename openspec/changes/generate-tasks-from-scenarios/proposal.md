## Why

`/draft` still asks a model to write `tasks.md` even though the file is
mechanical: one test task per spec scenario, then implementation.
`verify-change.ts` already checks that mapping is tests-first.

## What Changes

- A helper builds `tasks.md` from the delta spec scenarios.
- `/draft` writes proposal, specs, and design with the model, then runs
  the helper for tasks.
- Missing scenarios fail closed instead of inventing work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: task lists come from scenarios, not a
  second model pass.

## Impact

- `factory/scripts/generate-tasks.ts`
- `skills/draft/SKILL.md`
