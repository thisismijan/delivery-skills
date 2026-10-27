## Context

Step 5 currently says to dispatch exactly one assessor even when the
verdict will be `[]`. Step 6 already routes `outdated` to skip.

## Goals / Non-Goals

**Goals:**

- No model call when nothing is in scope.
- Scripted outdated only when the anchor is gone.

**Non-Goals:**

- Judging that a still-present line is moot. That stays with the
  assessor.
- Auto-applying suggestion blocks.

## Decisions

- **Keep unknown anchors.** If the command did not load the path, the
  comment stays in scope. Skipping without looking would hide a real
  comment.
- **New-side only.** An `old` side anchor is not compared to the head
  file. The assessor still sees it.
- **Outdated verdicts are written by the script.** They join any
  assessor verdicts before `verdicts.ts` checks the expected ids.

## Risks / Trade-offs

- [A file grew and the old line number still exists with new text] →
  still in scope; the assessor can mark it outdated.
