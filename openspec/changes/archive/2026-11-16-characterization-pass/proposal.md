## Why

The `/execute` test writer wrote tests only for the behaviour the change's spec
asked for. When a change modified existing code that no test referenced,
nothing recorded what that code did, so an unintended side effect had nothing
to fail against.

## What Changes

- `characterize.ts check <repoRoot> <changeDir>` lists the existing source
  files the plan names (Impact paths and recorded affected areas, expanded to
  tracked files) that no test references. A test references a file when its
  own name carries the file's stem, or it names the stem as a module. It exits
  3 when any are uncovered. New files are never listed, because they have no
  current behaviour.
- `/execute` runs it before writing the change's tests. On exit 3 the test
  writer, in a new characterization mode, pins what those files do today. The
  tests must pass on the current code through the green gate, and they are
  committed alone before the change's tests and kept out of the red gate. When
  every planned file is already referenced, no pass runs.
- The planned-path logic moves into `planned-paths.ts`, shared with the risk
  zone check.

Out of scope: coverage measurement tooling, triggering the pass from yellow
zones, and new code with no existing behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `test-gate`: untested behaviour a change touches is pinned before it
  changes.

## Impact

`factory/scripts/characterize.ts`, `factory/scripts/planned-paths.ts`,
`factory/scripts/risk-zones.ts`, new tests, `factory/agents/test-writer.md`,
`skills/execute/SKILL.md`, and `factory/skill-size-ceilings.json`.
