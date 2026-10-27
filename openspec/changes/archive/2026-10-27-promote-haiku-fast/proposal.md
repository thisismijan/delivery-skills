## Why

`haiku` cleared six representative `model-run` scores on the unscripted
mechanical-edit pack with mean relative utility 1.0 and no critical
misses. Live `resolve fast` refused during those runs; every candidate
dispatch used `resolve fast … --evaluation`. An operator promotion
approval naming `haiku` is required before live catalogue availability
can change.

## What Changes

- Mark `haiku` live in the fast catalogue tier.
- Leave `composer-1` evaluation-only. Keep `muse-spark-1.3-medium` live.
- Live resolve of the fast tier may return Haiku when the runtime
  advertises it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: exact operator approval marks Haiku live and
  does not mark Composer live.

## Impact

- `factory/model-catalogue.json`
- README and factory runtime notes
