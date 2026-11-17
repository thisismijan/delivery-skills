## Why

Each `SKILL.md` loads in full when its skill starts, so every byte added costs
tokens on every run. The pack's skills had grown to between 5 and 48 KB, and
nothing noticed when one grew further: a change could add a paragraph to
`/delivery` and no check would say so.

## What Changes

- `factory/skill-size-ceilings.json` records a ceiling for every `SKILL.md`, set
  at its current size.
- A new `skill-size.ts` compares each skill with its ceiling. `check` exits 1 and
  names any skill over its ceiling, a skill with no ceiling, or a ceiling for a
  skill that no longer exists. `raise <skill-path>` sets one skill's ceiling to
  its current size, the deliberate bump a growing change makes in review.
- `skill-size.test.ts` runs the check in the pack's tests, and the conventions
  say how a ceiling is raised.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: every shipped skill file has a recorded size
  ceiling.

## Impact

- New `factory/scripts/skill-size.ts`, `factory/skill-size-ceilings.json`
- `factory/CONVENTIONS.md`
