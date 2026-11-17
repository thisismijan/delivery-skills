## Why

Nothing compared what `/execute` built with what `/draft` planned. Step 9
checked the diff against the specs and tasks by the conductor's own reading, and
the implementer's handoff reports its own changed files. A build that touched
files the plan never named reached the holdout review with nothing pointing at
them, so scope creep relied on the reviewer noticing.

## What Changes

- `/draft` records the feasibility verdict's `affectedAreas` in the change
  metadata (`change-meta.ts write ... --areas '<json>'`). The field is optional,
  so changes drafted earlier still read.
- A new `plan-drift.ts` compares the build's changed files, outside
  `openspec/`, `.delivery/`, and `.review/`, with the paths the proposal's
  Impact section names and the recorded `affectedAreas`. A file counts as
  planned when it equals a planned path or sits under a planned folder. Test
  files are expected. A low-complexity change larger than the contained-diff
  limits is a size overrun. It exits 0 whatever it finds, and 1 only when its
  inputs cannot be read.
- `/execute` runs it after step 9, stops on an unreadable result, passes
  `plan-drift.json` to the holdout review, and names unplanned files and any
  overrun under "What the checks do not prove". The holdout reviewer is told to
  judge each unplanned file as scope creep unless the spec needs it.

## Capabilities

### New Capabilities

- `plan-drift-check`: comparing the build with its plan before the holdout
  review.

### Modified Capabilities

None.

## Impact

- New `factory/scripts/plan-drift.ts`; `factory/scripts/change-meta.ts`
- `skills/execute/SKILL.md`, `skills/draft/SKILL.md`,
  `factory/agents/holdout-reviewer.md`, `docs/reference.md`
