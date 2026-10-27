## Context

See proposal.md. Graduation already counts representative-run scores for an
exact candidate unless provenance is `test-repo-stand-in`. This change is
the ingest path for real paired artifacts.

## Goals / Non-Goals

**Goals:**

- Prepare capture skeletons next to the git fixtures.
- Score only captured baseline/candidate trees as `model-run`.
- Refuse the local stand-in path.

**Non-Goals:**

- Dispatching Haiku from this repository.
- Inventing token counts or output trees.
- Calling `applyFastPromotion`.

## Decisions

### The host runs the models

This pack cannot advertise or invoke Haiku. The operator dispatches the
live standard worker and `model-catalogue.ts resolve fast … --evaluation`
in a runtime that lists `haiku`, then drops the trees into the capture
directory.

### Token usage is required

`generate-paired-evidence.ts` needs both input and output tokens plus wall
time. Character-only usage is how the stand-in loop looks, so ingest
refuses it.

### Named workers are required

The candidate result must name the exact catalogue id. The baseline result
must name a different worker. Missing `selectedWorkerModel` is refused.

## Risks / Trade-offs

- [Operator pastes stand-in trees] → Refuse character usage, stand-in
  skill text, and missing worker names.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
