## Context

See proposal.md. Fast dispatch already requires five representative-run
scores, a 90 percent bar, no critical misses, and an exact operator
approval before live availability can change.

## Goals / Non-Goals

**Goals:**
- Give unscripted mechanical-edit units a representative corpus so Haiku
  and other fast candidates can be scored later.

**Non-Goals:**
- Putting Haiku on the live path.
- Scoring units the scripts already apply.
- Lowering the 90 percent bar.

## Decisions

### Scripted units stay out of the pack

The pack is only the cases `apply-mechanical-edit.ts` still reports
`select-model` for. A passing scripted rename is not a model evaluation.

### Scores are not promotion

Attaching representative scores that clear the sample bar still leaves
fast candidates evaluation-only until an operator names that candidate.

## Risks / Trade-offs

- [Synthetic scores] → Tests may attach 91 percent scores to prove the
  promotion gate. Those scores are not checked in as live evidence.

## Migration Plan

Ship the pack. Rollback is revert.

## Open Questions

None.
