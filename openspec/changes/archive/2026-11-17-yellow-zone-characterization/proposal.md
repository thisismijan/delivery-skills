## Why

Yellow zones in an owner-drawn `.delivery/zones` map were only reported. The
characterization pass ran only for planned files no test references, so code
the owner had flagged for extra care got none when some test named it.

## What Changes

- `characterize.ts check` reads the zone map and adds `pinned`: every file to
  pin before the change's tests, with its reason. The reason is "no test
  references it", or "yellow zone" for a referenced planned file in a yellow
  zone. A path in both a red and a yellow zone counts as red and is not pinned
  for yellow. The command exits 3 whenever anything is pinned.
- `/execute` pins every listed file in characterization mode. The test writer
  adds, for a yellow-zone file, only what its existing tests leave unpinned on
  the paths the change could touch.
- With no map, or no planned file in a yellow zone, the result is unchanged.
- The `uncovered` and `covered` fields keep their meaning, so the
  characterization measurement is unaffected.

Out of scope: red zones, which already stop for approval, and the reference
heuristic.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `test-gate`: yellow-zone files get a characterization pass.

## Impact

`factory/scripts/characterize.ts` and its tests, `skills/execute/SKILL.md`,
`factory/agents/test-writer.md`, the README, `docs/reference.md`,
`docs/workflow.md`, `docs/getting-started.md`, and
`factory/skill-size-ceilings.json`.
