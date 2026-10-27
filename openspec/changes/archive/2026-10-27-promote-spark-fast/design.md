## Context

See proposal.md. `applyFastPromotion` already changes only the named
fast candidate when the verdict is live.

## Goals / Non-Goals

**Goals:**

- Persist the operator approval for `muse-spark-1.3-medium`.
- Keep Composer and Haiku evaluation-only.

**Non-Goals:**

- Checking the capture trees into this repository.
- Promoting any other fast id.
- Lowering the 90 percent bar or the zero-miss rule.

## Decisions

### Catalogue is the live switch

Availability lives in `factory/model-catalogue.json`. Scoring helpers do
not write it. This change is the approval apply.

### Other fast ids stay gated

`resolveAvailableModel` for the fast tier returns Spark when advertised.
Composer or Haiku still fail closed without `--evaluation`.

## Risks / Trade-offs

- [Corpus stays on the operator machine] → The packed catalogue records
  the approval. Re-ingest is not required to dispatch Spark.

## Migration Plan

Ship the catalogue. Rollback is revert Spark to evaluation-only.

## Open Questions

None.
