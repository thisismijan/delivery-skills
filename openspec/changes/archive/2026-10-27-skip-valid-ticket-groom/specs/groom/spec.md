## MODIFIED Requirements

### Requirement: Read-only codebase grounding before grilling
Before the grilling loop begins, the command SHALL perform a read-only codebase exploration and SHALL reference concrete module names or domain terms found in the repository in its questions and slice proposals. When the resolved input already passes `verify-ticket.ts`, the command SHALL skip exploration and grilling.

#### Scenario: Grounding precedes grilling and is cited
- **WHEN** grooming begins for input that fails `verify-ticket.ts`
- **THEN** a read-only codebase exploration runs before any grilling question
- **AND** the command's questions and slice proposals reference concrete modules or domain terms from the repository

#### Scenario: A valid ticket skips grounding and grilling
- **WHEN** the resolved input passes `verify-ticket.ts`
- **THEN** the explorer is not dispatched
- **AND** grilling does not run
