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

### Use standard models for independently adjudicated review lenses

The max-review lenses produce candidate findings rather than the final verdict.
The main conversation verifies every candidate against the pinned code and
evidence. All lens workers therefore use the resolved standard-tier model.

A proven small reversible change runs the correctness/security and
tests/specification lenses. The reliability/operations and repository/blast
radius lenses remain mandatory when the change exceeds two files or 49 lines,
is one-way, touches Data, Contract, Config, Auth, or Infra, or cannot be
classified. `review-fanout.ts` applies those boundaries deterministically and
fails closed on malformed or unknown input. This reduces routine fan-out
without weakening risky changes.

### Re-review code only when the code changed

Address-comments records the starting head. A changed head or an existing
pending marker still requires cumulative gates and a fresh frontier holdout.
When replies and disputes leave the head unchanged, repeating those gates and
the holdout would inspect identical code. That path stays draft and proceeds to
the mandatory Stage 3 dual review instead.

## Risks / Trade-offs

- Default runs no longer add new routing observations. Operators collecting a
  corpus must opt in explicitly.
- Existing scripts remain available and tested; this change reduces invocation,
  not capability.
- The two-lens small-change pass can miss an operational concern that is not
  visible to the essential lenses. Strict size, reversibility, and surface
  conditions fail to the four-lens pass when uncertain.
- A wrongly classified reply-only comment can defer a needed finding to Stage
  3. The comment assessor still runs, code-changing classifications still
  require holdout, and Stage 3 remains mandatory before readiness.
