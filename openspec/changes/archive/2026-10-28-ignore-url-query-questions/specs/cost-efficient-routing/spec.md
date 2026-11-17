## ADDED Requirements

### Requirement: A question mark in a URL or inline code is not an open question

When `/draft` looks for an open question, it SHALL ignore `?` characters that appear only in a URL or in inline code. A complete ticket whose only `?` characters are in those forms SHALL skip the ticket-assessor and the feasibility-analyst the same way as a ticket with no `?`. A `?` that remains in the scoped sections SHALL still dispatch those models.

#### Scenario: A URL query string skips the models
- **WHEN** the body is otherwise a complete ordinary ticket and the only `?` characters are in a URL or inline code
- **THEN** no ticket-assessor is dispatched
- **AND** no feasibility-analyst is dispatched

#### Scenario: A real question still uses the models
- **WHEN** Context, User stories, What to build, or Acceptance criteria contains a `?` outside a URL and inline code
- **THEN** the ticket-assessor and feasibility-analyst still run
