## Why

Release-readiness lenses currently spawn read-only subagents with no model
tier, so they inherit the host's frontier default. Stage 3 already runs
independently adjudicated review lenses on the resolved standard model
because the main conversation still verifies every candidate. Stage 4 is the
same shape: the lenses collect findings; the conductor still synthesizes
GO or NO-GO, keeps unverified Critical and High blocking, and writes the
brief.

## What Changes

- Resolve the `standard` capability once and pass that exact model identifier
  to every release-readiness lens subagent (rollback, compatibility,
  security, operability).
- Keep GO/NO-GO, duplicate drop, bar explanations, and operator acceptance
  in the main conversation.
- Leave the small-change rule unchanged: rollback still runs in the main
  conversation when no lens subagents start.
- Do not dispatch fast-tier models. These findings can block a release and
  have no executable test, lint, or typecheck gate of their own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-readiness`: lens subagents use the resolved standard model.
- `cost-efficient-routing`: Stage 4 lenses follow the same standard-tier
  rule as Stage 3 review lenses.

## Impact

- `skills/delivery/workflows/release-readiness.md`
- `factory/CONVENTIONS.md`, `factory/RUNTIME.md`, `docs/workflow.md`, `README.md`
