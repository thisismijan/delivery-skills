## MODIFIED Requirements

### Requirement: Review fan-out is proportional to demonstrated risk

The max correctness review SHALL run no review-lens subagents when the measured diff has no reviewable code, the classification is complete, the change is reversible, and it touches none of Data, Contract, Config, Auth, or Infra. Incomplete classification SHALL still run all four lenses.

#### Scenario: No reviewable code skips the lenses
- **WHEN** the measured diff has no reviewable code, classification is complete, the change is reversible, and it touches none of the excluded surfaces
- **THEN** no review-lens subagent is dispatched

#### Scenario: Unknown classification retains the full review
- **WHEN** any small-change condition cannot be proved from the pinned diff
- **THEN** all four review lenses run
