## Context

`/code-review-max` already resolves `standard` and passes that exact id to
every independently adjudicated lens. Release readiness step 3 does not name
a tier, so the host default (frontier) runs four extra conversations on
every non-small change.

## Goals / Non-Goals

**Goals:**

- Pin every Stage 4 lens subagent to the resolved standard model.
- Keep fail-closed GO/NO-GO on the main conversation.

**Non-Goals:**

- Promoting a fast model for these lenses.
- Changing which lenses run, or the small-change rule.

## Decisions

- **Same resolve path as Stage 3.** Reuse
  `model-catalogue.ts resolve standard` against the recorded inventory so a
  runtime without a live standard candidate fails closed instead of falling
  back to frontier.
- **Findings stay candidates.** A lens may miss or over-report. The
  conductor still drops Stage 3 duplicates, keeps unverified Critical and
  High blocking, and writes the brief. Lowering the lens tier does not
  lower the gate.
- **Fast stays blocked.** There is no executable check that a rollback
  procedure is complete or that a compatibility hole is absent. That is
  the same reason classification stays off fast.

## Risks / Trade-offs

- [A standard model misses a rollback hole] → the conductor still reads
  the scan's one-way signals, the diff, and the OpenSpec change, and
  operator acceptance is still required for any remaining Critical or High.
