## MODIFIED Requirements

### Requirement: A structurally incomplete ticket does not start a ticket assessor

When `/draft` fetches a work item whose body fails `verify-ticket.ts`, it SHALL write an assessment from the verifier gaps and SHALL NOT dispatch the ticket-assessor. When the body passes, has no size warning, and Context, User stories, What to build, and Acceptance criteria contain no `?`, it SHALL write a `good` atomic assessment from those criteria and SHALL NOT dispatch the ticket-assessor. When the body passes with a size warning, it SHALL write a `too_large` assessment from that warning and SHALL NOT dispatch the ticket-assessor. A question mark without a size warning SHALL still dispatch exactly one ticket-assessor.

#### Scenario: Missing sections skip the assessor
- **WHEN** the work item body is missing a required section, Given/When/Then criterion, or checkbox
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those gaps

#### Scenario: Too many stories or criteria request a split without a model
- **WHEN** the work item body has more than one user story or more than three acceptance criteria
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A complete ticket with no open questions skips the assessor
- **WHEN** the work item body passes `verify-ticket.ts` with no size warning and those sections contain no `?`
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `good` with the ticket's Given/When/Then criteria

#### Scenario: A size warning skips the assessor as too large
- **WHEN** the work item body passes `verify-ticket.ts` with a size warning
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A question still uses the assessor
- **WHEN** the work item body passes `verify-ticket.ts` with no size warning and Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one ticket-assessor is dispatched
