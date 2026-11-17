## ADDED Requirements

### Requirement: An approved valid ticket input does not start a groom writer

When `/groom` skipped exploration because the input passed `verify-ticket.ts`, and the operator approved that same content without a rewrite, the command SHALL copy the verified source to the final draft path and SHALL NOT dispatch the groom-writer. A rewrite request, or input that failed the verifier, SHALL still dispatch the writer.

#### Scenario: Unchanged approval copies the source
- **WHEN** the input passed `verify-ticket.ts` and the operator approved that content without a rewrite
- **THEN** no groom-writer is dispatched
- **AND** the final draft is a verified copy of that source

#### Scenario: A rewrite still uses the writer
- **WHEN** the operator requests a rewrite, or the input failed `verify-ticket.ts`
- **THEN** the groom-writer still runs
