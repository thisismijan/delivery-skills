## Why

`/execute` already skips the test-writer when a mechanical-edit unit
applies as a script. Step 7 still said to skip the implementer and then
unconditionally dispatched it. A conductor following the later sentence
pays for a model after the files are already written.

## What Changes

- After a scripted apply at implement time, continue at the green gates.
  Do not dispatch the implementer.
- Unscripted units still dispatch the implementer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: a scripted apply at implement time does not
  start the implementer.

## Impact

- `skills/execute/SKILL.md`
