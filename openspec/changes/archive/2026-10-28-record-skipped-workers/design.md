## Context

`record-routing.ts` stores one observation per dispatched worker. Skips
never write that file, so `routing-scorecard.ts` cannot name them.
`ROUTING_PROFILING` currently turns off the whole scorecard block.

## Goals / Non-Goals

**Goals:**

- Persist each scripted skip as its own record under the run id.
- Count those records on the scorecard.
- Keep skip recording independent of diagnostic profiling.

**Non-Goals:**

- Estimating tokens, cost, or wall time a skipped worker would have
  used.
- Changing which workers are skipped.
- Promoting a fast model from skip counts.

## Decisions

- **Sibling files, not observations.** Skip records live in
  `.delivery/routing/<run>/skips/<skip-id>.json` so the existing
  observation schema stays unchanged.
- **Closed worker names.** Persist only the named factory workers:
  ticket-assessor, feasibility-analyst, groom-explorer, groom-writer,
  test-writer, implementer, comment-assessor, holdout-reviewer,
  review-lens, readiness-lens.
- **One persist per skip site.** Mechanical apply that skips both the
  test-writer and the implementer writes two records.
- **No invented usage.** Skip records carry a reason, never token or
  cost fields.

## Risks / Trade-offs

- A forgotten persist leaves the scorecard under-counting. Contract
  tests pin the helper name on every skip site.
- Duplicate `skipId` values fail closed rather than overwrite.
