## ADDED Requirements

### Requirement: A complete ordinary ticket does not start a feasibility analyst

When `/draft` finds a work item whose body passes `verify-ticket.ts` with no size warning, whose Context, User stories, What to build, and Acceptance criteria contain no `?`, and whose What to build and Acceptance criteria do not name authentication, secrets, or a data migration, it SHALL write a `feasible` verdict at medium complexity and SHALL NOT dispatch the feasibility-analyst. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: A complete ticket skips the analyst as feasible
- **WHEN** the body passes `verify-ticket.ts` with no size warning and those sections contain no `?`
- **AND** What to build and Acceptance criteria do not name authentication, secrets, or a data migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `yes` with medium complexity

#### Scenario: A question still uses the analyst
- **WHEN** the body passes `verify-ticket.ts` with no size warning and Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one feasibility-analyst is dispatched
