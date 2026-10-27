## Context

Paired captures used baseline `claude-sonnet-5-5-medium`. Catalogue
resolve returned `haiku` as evaluation-only. The advertised worker slug
was `claude-haiku-5-5-medium`; scores still record
`selectedWorkerModel: "haiku"`. Same prompt on both sides. Original
`repos/` trees were left untouched. Sample size 6, mean relative
utility 1.0, zero critical misses.

## Goals / Non-Goals

**Goals:**

- Persist the operator approval for `haiku`.
- Keep Composer evaluation-only.
- Keep Spark live.

**Non-Goals:**

- Changing safety floors or the 90 percent bar.
- Promoting Composer.
- Mapping catalogue id `haiku` onto a different advertised slug in the
  catalogue file.

## Decisions

- **Write only the approved row.** `applyFastPromotion` already updates
  the named id. Spark stays live because this approval does not touch it.
- **Live resolve uses the catalogue id.** Runtimes that advertise
  `haiku` can take it. A runtime that only advertises
  `claude-haiku-5-5-medium` still needs that exact id registered, or
  resolve stays closed. That mapping is a later catalogue row, not this
  promotion.

## Risks / Trade-offs

- [Host rejects `--model haiku`] → dispatch still uses the advertised
  slug the runtime accepts; the catalogue id is `haiku`.
