## ADDED Requirements

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
