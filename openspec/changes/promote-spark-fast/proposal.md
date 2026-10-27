## Why

`muse-spark-1.3-medium` cleared six representative `model-run` scores on
the unscripted mechanical-edit pack with no critical misses. An operator
approval naming that exact id is required before live catalogue
availability can change.

## What Changes

- Mark `muse-spark-1.3-medium` live in the fast catalogue tier.
- Leave `composer-1` and `haiku` evaluation-only.
- Live resolve of the fast tier may return Spark when the runtime
  advertises it. Other fast ids still need `--evaluation`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: exact operator approval marks Spark live and
  does not mark other fast candidates live.

## Impact

- `factory/model-catalogue.json`
- README and factory runtime notes
