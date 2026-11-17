## Why

Red and green gates in `factory/scripts/test-gate.ts` can pass with no expected test paths, because `expectedTestPaths` defaults to an empty list and `every` over an empty list is true. They also treat any basename substring in the output as proof a test ran. Re-entry in `skills/execute/SKILL.md` is told to bind evidence to a commit and command, but nothing checks that the code, command, or test contents still match. Stale or gamed evidence can stand in for a real gate.

## What Changes

- A red or green gate with no expected test paths fails closed.
- An expected test counts as run only when its normalized path appears as an exact path token in the output. A similar basename no longer counts.
- Each gate run records evidence: commit, argv, cwd, normalized expected paths, and a content hash per expected test file.
- A pure `verifyGateEvidence` function rejects reuse of evidence when any of those no longer match the current state.
- The execute and address-comments skills call the verification before reusing stored gate artifacts.

Out of scope: changing repository test, lint, or typecheck commands.

## Capabilities

### New Capabilities
- `test-gate`: fail-closed gate evaluation and evidence binding for red and green gates.

### Modified Capabilities

None.

## Impact

- `factory/scripts/test-gate.ts` and its tests, plus `factory/scripts/chaos.test.ts` fixtures.
- `skills/execute/SKILL.md` (re-entry reconciliation, red and green gate steps) and `skills/address-comments/SKILL.md`.
- The red-gate and green-gate JSON artifacts gain an evidence record.
