# draft-approach-challenge Specification

## Purpose
Find the cases a planned approach would miss while it is still a spec, so a
design that cannot be made complete is revised once or handed to a person
before any code is written, instead of being patched one review round at a
time.

## Requirements

### Requirement: Draft challenges the planned approach once before committing it
Unless feasibility rated the change low complexity, `/draft` SHALL dispatch
one read-only `approach-challenger` after authoring the spec and before
verifying it. `draft-route.ts approach` SHALL route `sound` to proceed and
`gaps` to adding each gap as a scenario or a stated non-goal. A first
`rethink` SHALL revise the design and challenge once more, and a second
`rethink` SHALL stop with exit 3 for a person to choose. A malformed or
contradictory verdict SHALL stop the draft.

#### Scenario: Low complexity
- **WHEN** feasibility rated the change low complexity
- **THEN** no challenger is dispatched and the skip is recorded

#### Scenario: Gaps
- **WHEN** the challenger finds concrete cases the approach misses but the approach is right
- **THEN** each becomes a scenario or a stated non-goal and the draft continues without another challenge

#### Scenario: Approach cannot be made complete
- **WHEN** the challenger returns rethink twice
- **THEN** the first revises the design and the second stops the draft

#### Scenario: Contradictory verdict
- **WHEN** a verdict says sound but lists gaps, or rethink without an alternative
- **THEN** the verdict is refused and the draft stops

### Requirement: Explain-back follows the approach challenge
When both the approach challenge and explain-back run, `/draft` SHALL complete the approach challenge step before starting explain-back, and SHALL NOT start artifact verification until explain-back has routed to proceed or escalated.

#### Scenario: Order of gates
- **WHEN** a draft reaches post-authoring checks
- **THEN** approach challenge runs before explain-back, and verify runs only after explain-back proceeds

### Requirement: Rejected alternatives guard the build
For a change rated medium or high complexity, `/draft` SHALL record in
`design.md` a `## Rejected alternatives` section listing each material option
not taken with why. The holdout reviewer SHALL fail a diff that implements one
of them unless the spec was changed to adopt it.

#### Scenario: A medium-complexity change
- **WHEN** `/draft` writes `design.md` for a medium-complexity change
- **THEN** it lists at least one rejected option with the reason it loses

#### Scenario: A diff that implements a rejected option
- **WHEN** the holdout review sees a diff that builds an option listed under rejected alternatives
- **THEN** it requests changes and names the option
