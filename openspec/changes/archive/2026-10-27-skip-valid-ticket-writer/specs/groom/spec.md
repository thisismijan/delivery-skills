## MODIFIED Requirements

### Requirement: Ticket drafts are verified for structure and fail closed
`scripts/verify-ticket.ts` SHALL fail a draft that lacks a required section, has no acceptance criteria or more than three, holds more than one user story, or states an acceptance criterion that is not written as Given/When/Then; it SHALL warn when a slice looks larger than the size heuristic. It SHALL print structured JSON, exit non-zero when it fails a draft, and be covered by `bun test`. A draft it fails SHALL be corrected and checked again, and never saved as the final file. When the input already verified and the operator accepted that exact content, grooming SHALL copy it to the final path without dispatching the groom-writer.

#### Scenario: A rejected draft never becomes final
- **WHEN** `verify-ticket.ts` rejects a draft
- **THEN** the draft is corrected and checked again
- **AND** it is not saved as the final file

#### Scenario: Accepted verified input is copied without a writer
- **WHEN** the input passed `verify-ticket.ts` and the operator accepted it unchanged
- **THEN** the final draft is a verified copy of that input
- **AND** the groom-writer is not dispatched
