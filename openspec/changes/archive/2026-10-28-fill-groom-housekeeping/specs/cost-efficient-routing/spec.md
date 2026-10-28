## ADDED Requirements

### Requirement: Housekeeping-only ticket gaps do not start groom exploration

When `/groom` input fails `verify-ticket.ts` only because Out of scope or Blocked by is missing, the command SHALL append those sections as `None.`, SHALL treat the result as a valid ticket, and SHALL NOT dispatch the groom-explorer or run grilling. Any other verifier failure SHALL keep exploration and grilling.

#### Scenario: Missing out of scope skips the explorer after a none fill
- **WHEN** the resolved input is otherwise a valid ticket and only Out of scope or Blocked by is missing
- **THEN** those sections are appended as `None.`
- **AND** no groom-explorer is dispatched
- **AND** no grilling questions are asked

#### Scenario: A missing context section still uses the explorer
- **WHEN** the resolved input is missing Context, User stories, What to build, or Acceptance criteria
- **THEN** the read-only codebase explorer still runs before grilling
