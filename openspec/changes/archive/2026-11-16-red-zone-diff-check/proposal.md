## Why

The red-zone build gate read only the change's plan. A build that strayed into
a red zone its plan did not name got every review lens later, but nothing
stopped it before the holdout review and the change request. A malformed zone
map was found only when a scan or a build hit it.

## What Changes

- `risk-zones.ts check-diff <repoRoot> <changeDir> <base> <head> [ledger]`
  applies the red-zone rule to the build's real diff, leaving out spec and
  delivery files. It exits 3 when the diff touches a red zone with no
  `red-zone <changeName>` approval, the same approval the plan check reads.
- `/execute` runs it after the plan drift check and stops before the holdout
  review on exit 3.
- `/delivery doctor` reports the number of red and yellow zones when a map
  exists, and a setup item naming the unreadable line when it cannot be read.
  With no map, doctor is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diff-surface-scan`: the red-zone approval also covers the build's real diff,
  and doctor checks the map.

## Impact

`factory/scripts/risk-zones.ts`, `factory/scripts/doctor.ts`, their tests,
`skills/execute/SKILL.md`, `docs/reference.md`, and
`factory/skill-size-ceilings.json`.
