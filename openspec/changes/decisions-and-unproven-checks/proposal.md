## Why

Agent output now reads as finished and mostly correct, so nothing prompts a
second look. A change description listed what was skipped and what was not
checked only when the writer judged it material, and it never listed the
choices the agent made on the reader's behalf: a default, an edge case's
behaviour, the reading taken when two requirements clashed, a scope cut. The
release-readiness brief said what passed but not what the passing checks leave
open. A reviewer could approve a green change without seeing either.

## What Changes

- The implementer and test-writer handoffs gain a **Decisions** heading: every
  choice the approved spec did not make, with why.
- `/execute` ends every change description with two sections, "Decisions made
  for you" and "What the checks do not prove". A new
  `change-description.ts check` refuses a description without both, with an
  empty one, or that claims the checks prove everything. `/execute` never
  opens a change without a passing check.
- The release-readiness brief always carries "Decisions to know about" and
  "What the checks do not prove", including what later rounds decided and what
  the stage's own checks leave open. Its review lenses get the decisions as
  choices to challenge, not settled facts.

## Capabilities

### New Capabilities

- `change-descriptions`: what a change description must say.

### Modified Capabilities

- `release-readiness`: the brief's two required sections.

## Impact

- New `factory/scripts/change-description.ts`
- `factory/agents/implementer.md`, `implementer-opus.md`, `test-writer.md`
- `skills/execute/SKILL.md`, `skills/delivery/workflows/release-readiness.md`
- `docs/reference.md`
