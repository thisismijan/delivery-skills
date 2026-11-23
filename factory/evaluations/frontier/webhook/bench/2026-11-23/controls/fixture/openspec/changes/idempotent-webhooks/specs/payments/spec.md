## ADDED Requirements

### Requirement: Each payment event is processed once

Each payment event SHALL be processed exactly once, however many times the
provider delivers it.

#### Scenario: A retried delivery

- **GIVEN** a charge event has been processed
- **WHEN** the provider delivers it again
- **THEN** it is not processed a second time

### Requirement: Refunds are recorded

A refund event SHALL be recorded against its charge.

#### Scenario: A partial refund

- **WHEN** the provider sends a refund for part of a charge
- **THEN** the refund is recorded against that charge
