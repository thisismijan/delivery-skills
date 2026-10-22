## ADDED Requirements

### Requirement: Diagnostic routing profiling is opt-in

The factory SHALL default diagnostic routing profiling to off. It SHALL run a
profile controller only when the validated profiling mode is `always`. Unknown
profiling modes SHALL fail configuration parsing.

#### Scenario: An ordinary run skips profiling
- **WHEN** no profiling setting is supplied
- **THEN** the factory runs no diagnostic profile controller

#### Scenario: Evidence collection is explicitly enabled
- **WHEN** the profiling mode is `always`
- **THEN** the factory runs the profile controller and records the existing
  shadow-routing evidence

#### Scenario: An unknown mode fails closed
- **WHEN** the profiling setting is neither `off` nor `always`
- **THEN** configuration parsing fails before workflow dispatch

### Requirement: Profiling does not control live delivery

Enabling or disabling diagnostic profiling SHALL NOT change the model selected
for live work, the work dispatched to authors, implementers, or assessors, the
frontier holdout reviewer, or any quality gate.

#### Scenario: Profiling is off during implementation
- **WHEN** implementation runs with profiling off
- **THEN** the same live implementation worker and all quality gates run
  without a profile-controller call

#### Scenario: Profiling is off during holdout review
- **WHEN** a holdout review runs with profiling off
- **THEN** the frontier holdout reviewer still runs with the same evidence and
  verdict routing

#### Scenario: Profiling is enabled
- **WHEN** a task runs with profiling set to `always`
- **THEN** its shadow recommendation is recorded but never dispatched for that
  task
