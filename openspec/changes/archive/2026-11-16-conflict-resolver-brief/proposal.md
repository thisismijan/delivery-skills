## Why

When a scripted branch update stopped on real conflicts, auto said to dispatch
"one agent" to resolve them, with no brief. Nothing told that agent to keep the
work that had already landed, to leave tests alone, or to stay inside the
conflict hunks, and nothing said when its result should stop for a person.

## What Changes

- A `conflict-resolver` subagent brief. It may only read and edit files, with
  no shell or forge, and works only inside the listed files' conflict hunks.
  It keeps both sides' intent; when they cannot both hold, it keeps the
  target's behaviour and reports the change's side under **Could not keep**.
  It never weakens, skips, or deletes a test or a check from either side.
- Auto dispatches that subagent with the conflicted files and the change's
  OpenSpec change. It aborts the rebase and stops for a person when the
  handoff lists anything it could not keep, or a conflict marker remains.
- Its output is advisory: one repair turn, then fail closed. The Cursor plugin
  leaves it writable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conflicted-change-update`: real conflicts are resolved under a defined
  brief that stops for a person when either side's work would be lost.

## Impact

`factory/agents/conflict-resolver.md`, `factory/scripts/subagent-outputs.ts`,
`skills/delivery/workflows/auto.md`, and a new test file.
