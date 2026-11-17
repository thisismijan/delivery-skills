# holdout-review Specification

## Purpose

This capability is the contract for the independent frontier holdout review that `/execute` must pass. It fixes the shape of the `ReviewVerdict`, the dimensions the reviewer scores (one of them a readiness-for-main dimension judged at the bar a senior engineer would apply), the rule that only a verdict holding on every dimension is satisfied, the routing guard that keeps a failed readiness dimension from ever approving, and the plain-language line the human-facing summary prints for readiness.

## Requirements

### Requirement: The verdict schema includes readiness for main

`ReviewVerdict` in `scripts/verdicts.ts` SHALL require a boolean `readyForMain` field next to the `specFaithful`, `testsMeaningful`, and `codeMatchesSpec` dimensions. A verdict without `readyForMain` MUST fail validation, so that the run fails closed by stopping and escalating and never continues on a partial verdict.

#### Scenario: A verdict with every dimension is accepted
- **WHEN** a holdout verdict holding `specFaithful`, `testsMeaningful`, `codeMatchesSpec`, and a boolean `readyForMain` is validated
- **THEN** validation succeeds and `readyForMain` is available as a boolean

#### Scenario: A verdict without readiness is refused
- **WHEN** a holdout verdict leaves out `readyForMain` or gives it a value that is not a boolean
- **THEN** validation throws
- **AND** the run stops and escalates instead of continuing

### Requirement: Readiness is judged as a senior engineer would

The reviewer SHALL decide `readyForMain` by asking whether a senior engineer would approve the diff for main, which takes in correctness bugs, security problems, unhandled errors, and material maintainability or resource problems. The reviewer SHALL NOT mark `readyForMain` down for matters of style, naming, or formatting. Whenever `readyForMain` is false, the reviewer SHALL give concrete findings that someone can act on.

#### Scenario: A real defect makes a conforming diff unready
- **WHEN** a diff meets the spec and its tests yet contains a correctness bug, a security hole, a swallowed error, or a material resource problem such as an N+1 query
- **THEN** the reviewer returns `readyForMain: false` with concrete findings that name the defect and can be acted on

#### Scenario: Style preferences leave readiness alone
- **WHEN** an otherwise sound diff draws only style, naming, or formatting objections
- **THEN** the reviewer does not mark `readyForMain` down for them

### Requirement: Satisfaction needs every dimension to hold

A verdict SHALL be `satisfied: "yes"` only when `specFaithful`, `testsMeaningful`, `codeMatchesSpec`, and `readyForMain` all hold. A single false dimension means the review is not satisfied.

#### Scenario: Four true dimensions may be satisfied
- **WHEN** every one of the four dimensions is true
- **THEN** a verdict of `satisfied: "yes"` is valid

#### Scenario: A false readiness dimension is never satisfied
- **WHEN** `readyForMain` is false
- **THEN** the verdict cannot be `satisfied: "yes"`

### Requirement: A failed readiness dimension can never approve

`scripts/review-route.ts` SHALL never return `approve` for a verdict whose `readyForMain` is false. It SHALL route such a verdict to `fix` and hand the reviewer's findings to the implementer's fix loop, except that it SHALL route to `escalate` once fix attempts are used up or when `shouldEscalate` is set. The guard SHALL hold even when the verdict's other fields disagree with each other, so the route fails closed.

#### Scenario: Unready code with attempts left goes to the fix loop
- **WHEN** routing is given a verdict with `readyForMain: false`, fix attempts remaining, and `shouldEscalate` not set
- **THEN** routing returns `fix`
- **AND** the implementer's fix loop receives the reviewer's findings

#### Scenario: Unready code with no attempts left escalates
- **WHEN** routing is given a verdict with `readyForMain: false` and either the fix attempts are used up or `shouldEscalate` is set
- **THEN** routing returns `escalate`

#### Scenario: Unready code is never approved
- **WHEN** routing is given any verdict with `readyForMain: false`
- **THEN** the route is not `approve`

### Requirement: The summary states readiness in plain words

`formatReviewSummary` in `scripts/review-summary.ts` SHALL print a plain-language `Yes` or `No` line for the readiness dimension, written in the same style as the other dimension lines and naming no raw field.

#### Scenario: The rendered summary carries a readiness line
- **WHEN** a summary is rendered from a review verdict
- **THEN** it holds a plain-language line saying whether the code is ready for main, such as "Code is ready for main: Yes"
- **AND** that line contains no raw verdict field name such as `readyForMain`
