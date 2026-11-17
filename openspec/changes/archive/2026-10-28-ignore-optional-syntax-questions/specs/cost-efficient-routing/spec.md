## MODIFIED Requirements

### Requirement: A question mark in a URL or inline code is not an open question

When `/draft` looks for an open question, it SHALL also ignore `?:`, `?.`, and `??`. A complete ticket whose only `?` characters are in a URL, inline code, or those forms SHALL skip the ticket-assessor and the feasibility-analyst the same way as a ticket with no `?`.

#### Scenario: Optional syntax skips the models
- **WHEN** the body is otherwise a complete ordinary ticket and the only `?` characters are in `?:`, `?.`, or `??`
- **THEN** no ticket-assessor is dispatched
- **AND** no feasibility-analyst is dispatched

#### Scenario: A real question still uses the models
- **WHEN** Context, User stories, What to build, or Acceptance criteria contains a `?` outside a URL, inline code, and those forms
- **THEN** the ticket-assessor and feasibility-analyst still run
