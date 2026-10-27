## ADDED Requirements

### Requirement: A structurally valid ticket input does not start groom exploration

When `/groom` input already passes `verify-ticket.ts`, the command SHALL NOT dispatch the groom-explorer and SHALL NOT run the grilling loop. It SHALL classify the input as a single ticket and SHALL still require operator approval before writing drafts. Input that fails the verifier SHALL keep exploration and grilling.

#### Scenario: A valid ticket skips the explorer
- **WHEN** the resolved input passes `verify-ticket.ts`
- **THEN** no groom-explorer is dispatched
- **AND** no grilling questions are asked
- **AND** the operator still approves before any draft is written

#### Scenario: A raw idea still uses the explorer
- **WHEN** the resolved input fails `verify-ticket.ts`
- **THEN** the read-only codebase explorer still runs before grilling
