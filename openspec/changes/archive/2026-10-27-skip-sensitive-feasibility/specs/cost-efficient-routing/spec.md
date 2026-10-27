## ADDED Requirements

### Requirement: Named safety-sensitive work does not start a feasibility analyst

When `/draft` finds authentication, secrets, or a data migration named in What to build or Acceptance criteria, it SHALL write a `needs_human` feasibility verdict and SHALL NOT dispatch the feasibility-analyst. A ticket that does not name those topics SHALL still dispatch exactly one analyst.

#### Scenario: Named authentication skips the analyst
- **WHEN** What to build or Acceptance criteria names authentication, secrets, or a data migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `needs_human`

#### Scenario: Ordinary tickets still use the analyst
- **WHEN** those sections do not name authentication, secrets, or a data migration
- **THEN** exactly one feasibility-analyst is dispatched
