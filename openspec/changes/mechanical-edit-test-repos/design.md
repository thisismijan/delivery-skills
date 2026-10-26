## Context

See proposal.md. Fast graduation already requires representative-run
scores for an exact candidate, five samples, a 90 percent bar, zero
critical misses, and an operator approval. Local test-repo rewrites can
meet those numbers without a real candidate model.

## Goals / Non-Goals

**Goals:**

- Run the unscripted pack as isolated git repositories.
- Produce paired evidence and corpus files without touching the catalogue.
- Keep Haiku evaluation-only even when the stand-in reports utility 1.0.

**Non-Goals:**

- Dispatching or promoting Haiku.
- Treating a listed-file identifier rewrite as a model run.
- Lowering the 90 percent bar.

## Decisions

### Provenance, not a different source

The observation source stays `representative-run` so the loop matches the
real scoring path. Evaluation provenance `test-repo-stand-in` is what
graduation skips. Existing scores without provenance still count.

### Stand-in rewrites stay listed-file only

The candidate tree is a local identifier rewrite of the files the fixture
already lists. That is enough to differ the managed trees and prove the
loop. It is not a gold rewrite, so it must not graduate a fast model.

### Corpus stays off the catalogue

The helper writes under a caller directory. It never edits
`factory/model-catalogue.json`.

## Risks / Trade-offs

- [Identical-tree utility 1.0] → Skip stand-in provenance in the
  representative exact-candidate sample, including after an approval.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
