## MODIFIED Requirements

### Requirement: Grooming explores the codebase read-only before it asks questions
Grooming SHALL look through the repository without changing it before the first clarifying question, and its questions and proposed slices SHALL name real modules or domain terms it found. Input that already passes `verify-ticket.ts` SHALL skip both the exploration and the questions.

#### Scenario: Exploration comes first and is cited
- **WHEN** grooming starts on input that `verify-ticket.ts` rejects
- **THEN** the read-only exploration finishes before the first question is asked
- **AND** the questions and proposed slices name modules or terms from the repository

#### Scenario: A ticket that already verifies skips exploration and questions
- **WHEN** the input already passes `verify-ticket.ts`
- **THEN** no explorer is dispatched
- **AND** no clarifying questions are asked
