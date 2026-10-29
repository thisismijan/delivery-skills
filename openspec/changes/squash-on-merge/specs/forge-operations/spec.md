## MODIFIED Requirements

### Requirement: Mutating forge operations are explicit and approval bounded
Draft creation, draft-state changes, notes, inline notes, and discussion replies
SHALL require explicit approved input and SHALL return normalized publication
receipts. Draft creation SHALL mark the change to squash its commits on merge
wherever the forge supports a per-change squash flag.

#### Scenario: Mutation lacks approval
- **WHEN** a caller requests a forge mutation without `approved: true`
- **THEN** the command refuses the request before invoking any adapter

#### Scenario: Note body is unsafe
- **WHEN** a publication body is outside the repository review directory or resembles a secret
- **THEN** the command refuses publication before invoking any adapter

#### Scenario: A GitLab change squashes on merge
- **WHEN** the factory creates a GitLab draft change through the adapter or session tools
- **THEN** the create request sets `squash` to true
