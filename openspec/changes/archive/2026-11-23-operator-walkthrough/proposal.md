## Why

The factory writes the change and the operator merges it. Nothing checks that
the operator understands what they are merging, so it is easy to approve a
change nobody on the team can explain. A Socratic tutor's loop fits this: ask
one question at a time, never give the answer first, narrow the question when
an answer is wrong, and do not credit an insight the person did not state.

## What Changes

- `/delivery walkthrough <iid>` asks the operator three to five questions
  about the change, one per message, grounded in files at the pinned head.
- `walkthrough.ts topics` lists grounded topics: hard-to-undo changes and
  risky surfaces from the diff, acceptance scenarios, turned-down
  alternatives, and the source files that changed most.
- `walkthrough.ts record` validates and saves how each question went;
  `summary` prints it in plain words.
- Release readiness shows the summary for the same head, or suggests the
  walkthrough as a step only a person can do. It never changes GO or NO-GO.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `delivery-native-workflow`: an opt-in operator walkthrough before merge.

## Impact

`skills/delivery/workflows/walkthrough.md`, `factory/scripts/walkthrough.ts`,
`factory/scripts/diff-scan.ts` (exports its git diff helper), the delivery
route table, entries, help, the Forge capability row, release readiness,
`README.md`, `docs/workflow.md`, and `docs/reference.md`.
