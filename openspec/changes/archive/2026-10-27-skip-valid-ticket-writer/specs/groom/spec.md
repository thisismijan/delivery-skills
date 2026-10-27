## MODIFIED Requirements

### Requirement: Structural ticket-draft verification (fail closed)
`scripts/verify-ticket.ts` SHALL reject a draft missing any required section, SHALL reject a draft with zero or more than three acceptance criteria, SHALL reject a draft whose User stories section contains more than one user story, SHALL reject a draft in which any acceptance criterion is not a Given/When/Then behaviour statement, and SHALL warn when a slice exceeds the size heuristic. It SHALL emit structured JSON and exit non-zero on failure, and it SHALL be exercised by `bun test`. A draft that fails verification SHALL be fixed and re-emitted, and SHALL never be written as the final artifact. When the input already passed the verifier and the operator approved that content without a rewrite, the command SHALL copy that source to the final path and SHALL NOT dispatch the groom-writer.

#### Scenario: A failing draft is never written as final
- **WHEN** a draft fails `verify-ticket.ts`
- **THEN** it is fixed and re-emitted
- **AND** it is never written as the final artifact

#### Scenario: An unchanged valid input is copied without a writer
- **WHEN** the input passed `verify-ticket.ts` and the operator approved that content without a rewrite
- **THEN** the final draft is a verified copy of that source
- **AND** the groom-writer is not dispatched
