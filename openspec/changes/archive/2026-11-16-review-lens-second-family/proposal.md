## Why

Every `/code-review-max` lens ran on the same resolved standard model, usually
from the same family as the implementer. Models in one family share training and
blind spots, so four lenses on one family can miss the same thing. The catalogue
already lists standard models from more than one family, but had no notion of
family to choose by.

## What Changes

- Each catalogue entry records an optional `family`, and the shipped catalogue
  sets one for every model.
- A new `model-catalogue.ts second-family <tier> <inventory.json>` returns the
  usual model and the first live, advertised model at that tier from a different
  family, or none with a reason.
- `/code-review-max` runs exactly one lens on that model in place of the usual
  one (the correctness and security lens when it runs, otherwise the first lens
  the plan runs), so the lens count and cost do not change. With one family, every
  lens uses the usual model. The output lists the model each lens used under
  `### Lens models`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: one review lens may run on a second model family at
  the same tier, at no extra cost.

## Impact

- `factory/model-catalogue.json`, `factory/scripts/model-catalogue.ts`
- `skills/code-review-max/SKILL.md`, `docs/reference.md`
