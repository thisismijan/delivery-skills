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
- Run independently adjudicated review lenses on the standard tier, using two
  essential lenses for proven small reversible changes and all four for
  everything else.
- Skip duplicate comment-round gates and holdout review when no commit changed
  the already-reviewed head.
- Keep live model selection, implementation, holdout review, and all quality
  gates unchanged for code-changing and higher-risk work.

## Capabilities

### New Capabilities

- `cost-efficient-routing`: opt-in diagnostic profiling and bounded review
  fan-out that do not weaken code-changing or higher-risk delivery paths.

### Modified Capabilities

None.

## Impact

- `factory/scripts/config.ts`: validates the profiling mode.
- Draft, execute, address-comments, and delivery skills: gate diagnostic
  profiling on the validated setting.
- README and reference documentation: document the default and opt-in mode.
