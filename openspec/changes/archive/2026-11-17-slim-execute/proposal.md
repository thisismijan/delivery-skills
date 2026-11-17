## Why

`skills/execute/SKILL.md` was about 35 KB and is read on every build. Its
routing-profiling steps run only when profiling is `always`. Its
mechanical-edit language list appeared twice and only explains what the
helper's verdict already decides. The fast-model promotion procedure is the
operator's, not the build's.

## What Changes

- The profiling blocks for the implementer and the holdout reviewer move to
  `factory/reference/routing-profiling.md`. `/execute` reads it only when
  `routingProfiling` is exactly `always`.
- The mechanical-edit language list moves to
  `factory/reference/mechanical-edit.md`. Both places that repeated it now
  point there.
- The fast-model promotion rules and safety floors move to
  `factory/reference/fast-models.md`. `/execute` keeps the rule: never
  dispatch a catalogue fast model that is not live.
- `/execute` drops from 35,041 to 29,436 bytes (16 percent), and its ceiling
  is lowered to match. No gate changes.
- `factory/reference/` joins the generic boundary, so it names no host or
  vendor, like the skill text it came from.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `delivery-native-workflow`: `/execute` loads profiling, mechanical-edit, and
  fast-model detail on demand.

## Impact

`skills/execute/SKILL.md`, three new files under `factory/reference/`,
`factory/scripts/generic-boundary.ts`, the contract tests that read the moved
text, `CONTRIBUTING.md`, and `factory/skill-size-ceilings.json`.
