## Context

See proposal.md. `evaluatePromotion` and `applyFastPromotion` already take
an exact candidate. They do not write the catalogue file.

## Goals / Non-Goals

**Goals:**

- Write live availability through a promote command.
- List a new exact id as evaluation-only without guessing its tier.

**Non-Goals:**

- Auto-promoting every id that clears the bar.
- Moving scores from one version id to another.
- Guessing that an advertised model belongs on the fast tier.

## Decisions

### Register is explicit

`model-catalogue.ts register-fast <id>` appends evaluation-only when the
id is new. An id already on frontier or standard is refused. Fast
membership is not inferred from the host inventory.

### Promote writes only a live verdict

`fast-dispatch.ts promote <corpus> <id> --approve <id> <catalogue>` loads
the corpus, evaluates, and writes the catalogue only when the verdict is
live. A missing or mismatched approval leaves the file unchanged.

## Risks / Trade-offs

- [Operator can still pass `--approve` too early] → Evidence must still
  clear; the command exits non-zero and does not write.

## Migration Plan

Ship the commands. Existing live rows stay as they are.

## Open Questions

None.
