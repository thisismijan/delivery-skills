## MODIFIED Requirements

### Requirement: Ticket-shape input skips exploration

When the resolved input fails `verify-ticket.ts` only because Out of scope or Blocked by is missing, the command SHALL append those sections as `None.` and SHALL skip exploration and grilling the same way as a ticket that already passed.

#### Scenario: Housekeeping gaps are filled as none
- **WHEN** the input is otherwise a valid ticket and only Out of scope or Blocked by is missing
- **THEN** those sections are appended as `None.`
- **AND** exploration and grilling are skipped
