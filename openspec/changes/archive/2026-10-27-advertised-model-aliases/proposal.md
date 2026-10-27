## Why

Cursor now advertises Claude Haiku 5.5, Muse Spark 1.3, and the current
frontier and standard workers. It still does not advertise Composer.
Live resolve matches catalogue ids against the recorded inventory. The
Haiku catalogue id is `haiku`; the host accepts `claude-haiku-5-5-medium`.
Without an alias, a run that records the host list cannot dispatch the
live Haiku worker. Guessing Composer is still forbidden.

## What Changes

- Catalogue candidates may list advertised aliases. Resolve returns the
  inventory id the host advertised, not a nickname the host rejects.
- `haiku` aliases `claude-haiku-5-5-medium`. Spark already uses its host
  id. Composer stays evaluation-only and has no alias, because this host
  does not advertise it.
- Do not register or promote models that are only a UI label, and do not
  invent slugs for names that are not exact host ids.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: live resolve may match an advertised alias of
  an approved candidate and still refuse Composer.

## Impact

- `factory/model-catalogue.json`
- `factory/scripts/model-catalogue.ts`
