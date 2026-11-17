## ADDED Requirements

### Requirement: Explain-back follows the approach challenge
When both the approach challenge and explain-back run, `/draft` SHALL complete the approach challenge step before starting explain-back, and SHALL NOT start artifact verification until explain-back has routed to proceed or escalated.

#### Scenario: Order of gates
- **WHEN** a draft reaches post-authoring checks
- **THEN** approach challenge runs before explain-back, and verify runs only after explain-back proceeds
