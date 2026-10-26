## Context

See proposal.md. The language service already exposes document formatting.
Import-only already compares a stripped view of the file before writing.

## Goals / Non-Goals

**Goals:**
- Reformat listed TypeScript files without a model when only trivia and
  layout change.

**Non-Goals:**
- Python or Java format-only.
- Live fast-model promotion.

## Decisions

### Shape check, not trust

After formatting, walk both trees. Identifier text and literals must match.
If they do not, write nothing.

## Risks / Trade-offs

- [Host formatter disagrees with the language service] → The script uses
  TypeScript's own formatter. Teams that require Prettier still get a
  conservative no-op or a layout-only change that existing tests must still
  pass.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
