## Why

`skills/delivery/SKILL.md` was about 48 KB and is read in full on every
`/delivery` call. Four parts of it serve only some verbs: setup, the human
decision brief and its template, the command cheat-sheet, and the ledger writes
the conductor owns.

## What Changes

- Setup (`doctor`, `init`) moves to `workflows/setup.md`, which gains the
  Never, Terminal stops, and Ledger writes sections every stage workflow has.
- The human decision brief moves to `reference/decision-brief.md`.
- The command cheat-sheet moves to `reference/help.md`.
- The ledger writes the conductor owns move into `workflows/delivery-ledger.md`
  under "Writes the conductor owns". The conductor already reads that file on
  every run.
- Each moved section leaves a one-line pointer naming when to read the file.
  The conductor drops from 47,908 to 36,368 bytes (24 percent), and its size
  ceiling is lowered to match.
- No rule changes meaning. Contract tests that read the moved text now read it
  from its new file. The capability table stays in the conductor because every
  verb checks it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `delivery-native-workflow`: the conductor loads verb-specific detail on
  demand.

## Impact

`skills/delivery/SKILL.md`, `skills/delivery/workflows/setup.md`,
`skills/delivery/reference/help.md`,
`skills/delivery/reference/decision-brief.md`,
`skills/delivery/workflows/delivery-ledger.md`, the contract tests that read
those sections, `docs/workflow.md`, and `factory/skill-size-ceilings.json`.
