## Why

Fast catalogue models stay evaluation-only until scored reversible work clears a 90 percent bar. HDLV-7 added scoring and a promotion report that keeps live and representative-run evidence in separate groups, but `evaluateFastDispatch` still pools those sources, does not require representative exact-candidate evidence, does not name the safety floors, and does not require an exact operator promotion approval before availability becomes live. Cheaper models must not go live from synthetic fixtures or public rankings alone.

## What Changes

- Count only representative-run scores for the exact candidate when deciding whether a fast model may run or graduate. Live evidence is never mixed into that sample.
- Keep the existing bars: five scored reversible cases, mean relative utility of at least 90 percent, and zero critical misses. Falling short of any bar leaves the model evaluation-only. The 90 percent bar is not lowered.
- Name and apply the safety floors so auth, migration, concurrency, distributed-state, weak-verification, and holdout tasks cannot take a fast model.
- Add a promotion helper that leaves live availability unchanged unless an operator promotion approval names that exact candidate. Passing evidence alone does not flip the catalogue. Public rankings and unscored fixtures never promote.

Out of scope: ranking models from public benchmarks as evidence, and lowering the existing quality bar.

## Capabilities

### New Capabilities

- `fast-model-graduation`: representative-run exact-candidate evidence, named safety floors, the 90 percent bar, and exact operator promotion approval before a fast catalogue model becomes live.

### Modified Capabilities

None.

## Impact

- `factory/scripts/fast-dispatch.ts`: extend `evaluateFastDispatch` and add a promotion helper that applies operator approval to catalogue availability.
- Factory tests for dispatch, safety floors, and promotion, plus the existing routing observation coverage that currently treats mixed scored evidence as enough.
- `factory/RUNTIME.md`, `README.md`, `skills/delivery/SKILL.md`, `skills/execute/SKILL.md`, and the wording contracts that pin them.
