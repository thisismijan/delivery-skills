## Why

Shadow routing currently dispatches a frontier profiling agent even though its
recommendation cannot affect the current task. A normal delivery ticket pays
for three such calls, and each comment round adds two more. This diagnostic
cost should be incurred only when an operator is collecting routing evidence.

## What Changes

- Add `ROUTING_PROFILING`, defaulting to `off`, with `always` as the explicit
  evidence-collection mode.
- Skip profiling agents and their dependent routing telemetry when profiling is
  off.
- Keep live model selection, implementation, holdout review, and all quality
  gates unchanged in both modes.

## Capabilities

### New Capabilities

- `cost-efficient-routing`: opt-in diagnostic profiling that does not alter
  live dispatch or quality controls.

### Modified Capabilities

None.

## Impact

- `factory/scripts/config.ts`: validates the profiling mode.
- Draft, execute, address-comments, and delivery skills: gate diagnostic
  profiling on the validated setting.
- README and reference documentation: document the default and opt-in mode.
