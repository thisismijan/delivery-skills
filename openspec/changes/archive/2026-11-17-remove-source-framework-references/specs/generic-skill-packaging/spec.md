## MODIFIED Requirements

### Requirement: Generic files stay vendor neutral
Human-facing generic files under the core packaging boundary MUST NOT name an LLM vendor, agent host, forge, or tracker product.

#### Scenario: Portability contract test scans core files
- **WHEN** the repository test suite scans the generic packaging boundary
- **THEN** it fails on a forbidden product name
