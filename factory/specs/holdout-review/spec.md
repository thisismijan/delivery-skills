# holdout-review Specification

## Purpose

The `holdout-review` capability defines the contract for the independent Opus holdout review that gates `/execute`. It specifies the `ReviewVerdict` schema, the dimensions the reviewer judges (including a code-readiness dimension held to a senior-approval bar), the rule that a satisfied review requires every dimension to hold, the routing guard that an unsatisfied code-readiness dimension can never approve, and the plain-language human-facing summary line for code readiness.

## Requirements

### Requirement: Holdout verdict carries a code-readiness dimension

The `ReviewVerdict` schema (`scripts/verdicts.ts`) SHALL include a required boolean field `readyForMain` alongside the existing `specFaithful`, `testsMeaningful`, and `codeMatchesSpec` dimensions. A verdict JSON that omits `readyForMain` MUST fail validation so the run fails closed (stop and escalate), never proceeding on an incomplete verdict.

#### Scenario: Verdict with all four dimensions parses
- **WHEN** a holdout verdict carrying `specFaithful`, `testsMeaningful`, `codeMatchesSpec`, and a boolean `readyForMain` is validated
- **THEN** it parses successfully and exposes `readyForMain` as a boolean

#### Scenario: Verdict missing the code-readiness dimension fails closed
- **WHEN** a holdout verdict omits `readyForMain` (or supplies a non-boolean value)
- **THEN** validation throws
- **AND** the run stops and escalates rather than proceeding

### Requirement: Reviewer judges code readiness at the senior-approval bar

The holdout reviewer SHALL judge `readyForMain` as whether a senior engineer would approve the diff for main: it covers correctness bugs, security issues, unhandled errors, and material maintainability or resource problems. The reviewer SHALL NOT lower `readyForMain` for style, naming, or formatting nitpicks. When `readyForMain` is false, the reviewer SHALL produce concrete, actionable findings.

#### Scenario: A spec-conformant diff with a real defect is not ready
- **WHEN** a diff satisfies the spec and tests but contains a correctness bug, a security hole, a swallowed error, or a material resource problem (for example an N+1 query)
- **THEN** the reviewer returns `readyForMain: false` with concrete, actionable findings naming the defect

#### Scenario: Style and naming nitpicks do not fail readiness
- **WHEN** the only concerns with an otherwise sound diff are style, naming, or formatting preferences
- **THEN** the reviewer does not lower `readyForMain` on that basis

### Requirement: A satisfied review requires every dimension to hold

A review verdict SHALL be `satisfied: "yes"` only when all four dimensions (`specFaithful`, `testsMeaningful`, `codeMatchesSpec`, `readyForMain`) hold. If any dimension is false, the review is not satisfied.

#### Scenario: All four dimensions true is satisfiable
- **WHEN** all four dimensions are true
- **THEN** `satisfied: "yes"` is a valid verdict

#### Scenario: A false code-readiness dimension is not satisfied
- **WHEN** `readyForMain` is false
- **THEN** the review is not `satisfied: "yes"`

### Requirement: An unsatisfied code-readiness dimension never approves

Routing (`scripts/review-route.ts`) SHALL never yield `approve` for a verdict whose `readyForMain` is false. Such a verdict SHALL route to `fix`, carrying the reviewer's findings into the implementer fix loop, except that it SHALL route to `escalate` when fix attempts are exhausted or `shouldEscalate` is set. This guard holds even if other fields are inconsistent (fail closed).

#### Scenario: False readiness routes to the fix loop
- **WHEN** routing receives a verdict with `readyForMain: false`, attempts remaining, and `shouldEscalate` unset
- **THEN** the route is `fix`
- **AND** the reviewer's findings are passed to the implementer fix loop

#### Scenario: False readiness at the attempt ceiling escalates
- **WHEN** routing receives a verdict with `readyForMain: false` and fix attempts are exhausted or `shouldEscalate` is set
- **THEN** the route is `escalate`

#### Scenario: False readiness can never approve
- **WHEN** routing receives any verdict with `readyForMain: false`
- **THEN** the route is never `approve`

### Requirement: The human-facing summary reports code readiness in plain language

The review summary (`scripts/review-summary.ts`, `formatReviewSummary`) SHALL render a plain-language `Yes`/`No` line for the code-readiness dimension, consistent in style with the existing dimension lines and exposing no raw field names.

#### Scenario: Summary includes the readiness line
- **WHEN** a review summary is rendered from a verdict
- **THEN** it includes a plain-language line reporting whether the code is ready for main (for example "Code is ready for main: Yes")
- **AND** the line contains no raw verdict field name such as `readyForMain`
