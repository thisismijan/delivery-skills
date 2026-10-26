## 1. Configuration tests

- [x] 1.1 Test the default-off mode, explicit always mode, and rejection of an
  unknown value.
- [x] 1.2 Implement validated `ROUTING_PROFILING` configuration.

## 2. Workflow contracts

- [x] 2.1 Test that draft, execute, and address-comments gate profiling on the
  explicit always mode.
- [x] 2.2 Test that holdout review and live dispatch remain mandatory.
- [x] 2.3 Gate diagnostic profiling and dependent telemetry in each workflow.

## 3. Documentation

- [x] 3.1 Document the default, opt-in mode, and unchanged quality controls.
- [x] 3.2 Update the README, workflow, reference, and runtime docs for
  risk-based review spend and reply-only comment rounds.

## 4. Review-cost controls

- [x] 4.1 Pin independently adjudicated max-review lenses to the standard tier.
- [x] 4.2 Run two essential lenses only for proven small reversible changes,
  retaining all four for risky or unknown changes.
- [x] 4.3 Enforce small-change boundaries with a deterministic, fail-closed
  fan-out helper and boundary tests.
- [x] 4.4 Skip duplicate address-comments holdout work only when the head did
  not change and no pending re-review exists.
- [x] 4.5 Make execute bookkeeping explicitly reuse existing evidence without
  another model call.

## 5. Verification

- [x] 5.1 Run focused configuration and workflow contract tests.
- [x] 5.2 Run delivery checks, the factory suite, and repository checks.
