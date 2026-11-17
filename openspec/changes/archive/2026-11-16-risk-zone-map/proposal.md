## Why

`diff-scan.ts` marked risky surfaces from built-in path and line heuristics
only. An area that is risky for reasons a path cannot show, such as billing
rules in an ordinary-looking module, was treated like any other code: it could
get a two-lens review and be built under plan approval alone.

## What Changes

- The repository owner may draw an optional map at `.delivery/zones` in the
  main checkout, one zone per line, `red <path or glob>` or
  `yellow <path or glob>`. A malformed line makes every reader exit 1.
- With a map, `diff-scan.ts` adds `zones` listing the changed paths in each
  kind. `/code-review-max` copies the red paths into the fan-out input as
  `redZones`, which runs every lens at any level. Yellow paths are reported
  only.
- `risk-zones.ts check <repoRoot> <changeDir> [ledger]` compares the
  proposal's Impact paths and the recorded affected areas with the map. Those
  paths are expanded to tracked files. It exits 3 when they reach a red zone,
  or name no path while a red zone exists, unless an Approvals line names
  `red-zone <changeName>`. `/execute` and auto stop there for a person; plan
  approval and `continuous-delivery: yes` do not cover it. An auto worker reads
  the run ledger beside its journal.
- With no map, scanning, fan-out, and execute behave exactly as before.

Out of scope: drawing the map, acting on yellow zones beyond reporting them,
and changing the built-in heuristic surfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diff-surface-scan`: owner-drawn red zones force a full review and a
  person's approval before the build.

## Impact

`factory/scripts/zone-map.ts`, `factory/scripts/risk-zones.ts`,
`factory/scripts/diff-scan.ts`, `factory/scripts/review-fanout.ts`, a new test
file, `skills/code-review-max/SKILL.md`, `skills/execute/SKILL.md`,
`skills/delivery/workflows/auto.md`, `docs/reference.md`, and
`factory/skill-size-ceilings.json`.
