## Context

The profile controller is a frontier, read-only diagnostic agent. Its shadow
recommendation is recorded for later evaluation and is explicitly forbidden
from changing the current worker. Running it unconditionally adds model calls
without improving the current delivery outcome.

## Goals / Non-Goals

**Goals:**
- Avoid diagnostic model calls by default.
- Preserve an explicit mode for collecting routing evidence.
- Keep all live dispatch and quality decisions identical.

**Non-Goals:**
- Promote cheaper models.
- Change model-selection rules or safety floors.
- Remove routing evaluation tooling.

## Decisions

### Use a closed two-value setting

`ROUTING_PROFILING` accepts `off` or `always` and defaults to `off`. Unknown
values fail configuration parsing rather than silently enabling spend or
selecting an ambiguous mode.

### Gate the complete dependent telemetry block

When profiling is off, the workflow skips the controller, profile validation,
usage capture, routing persistence, and scorecard refresh for that task. Those
steps depend on the controller-produced profile. The actual author,
implementer, assessor, and holdout reviewer still run with the same selected
models and gates.

### Retain the current path unchanged when enabled

`always` keeps the existing profile, shadow route, usage, persistence, and
scorecard flow. This lets evaluation runs continue collecting comparable
evidence.

## Risks / Trade-offs

- Default runs no longer add new routing observations. Operators collecting a
  corpus must opt in explicitly.
- Existing scripts remain available and tested; this change reduces invocation,
  not capability.
