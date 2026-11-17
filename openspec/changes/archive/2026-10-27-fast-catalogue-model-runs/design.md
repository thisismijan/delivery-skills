## Context

See proposal.md. Fast graduation already keys scores on an exact candidate
id. The ingest helper still defaulted that id to `haiku`.

## Goals / Non-Goals

**Goals:**

- Score Spark, Composer, Haiku, or any later fast catalogue id the same way.
- Fail closed when the named model is not a fast catalogue candidate.

**Non-Goals:**

- Dispatching a fast model from this repository.
- Changing live availability.

## Decisions

### The operator names the candidate

`ingest` takes the exact catalogue id. There is no implied default. The
id must appear in `factory/model-catalogue.json` under the fast tier.

### Haiku remains one candidate

Tests may still use `haiku` as a fixture id. They also cover at least one
other fast candidate and refuse a standard-tier id.

## Risks / Trade-offs

- [Forgotten argument] → CLI usage lists the fast catalogue ids.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
