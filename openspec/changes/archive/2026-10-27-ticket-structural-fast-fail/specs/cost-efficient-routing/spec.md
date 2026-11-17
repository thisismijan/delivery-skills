## ADDED Requirements

### Requirement: A structurally incomplete ticket does not start a ticket assessor

When `/draft` fetches a work item whose body fails `verify-ticket.ts`, it SHALL write an assessment from the verifier gaps and SHALL NOT dispatch the ticket-assessor. A body that passes structural verification SHALL still dispatch exactly one ticket-assessor.

#### Scenario: Missing sections skip the assessor
- **WHEN** the work item body is missing a required section, Given/When/Then criterion, or checkbox
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those gaps

#### Scenario: Too many stories or criteria request a split without a model
- **WHEN** the work item body has more than one user story or more than three acceptance criteria
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A structurally valid ticket still uses the assessor
- **WHEN** the work item body passes `verify-ticket.ts`
- **THEN** exactly one ticket-assessor is dispatched
