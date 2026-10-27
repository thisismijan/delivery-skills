## ADDED Requirements

### Requirement: A host that cannot dispatch the candidate cannot score it

Mechanical-edit model-run capture SHALL require the host to accept the exact fast catalogue id as a dispatchable model before the candidate arm. Listing the id in the runtime inventory, or resolving it with `--evaluation`, SHALL NOT count as a candidate run. A refused dispatch SHALL stop the capture. Ingest SHALL NOT write corpus scores from a missing candidate arm, a copied tree from another candidate, or invented token counts. Live catalogue availability SHALL NOT change.

#### Scenario: Capture notes require a dispatchable host id
- **WHEN** the unscripted pack is prepared for model-run capture
- **THEN** the capture notes say the host must accept the exact candidate id, evaluation resolve is not enough, and every unscripted fixture still needs a candidate run

#### Scenario: A refused host id does not promote
- **WHEN** the host rejects the exact candidate id after a baseline run
- **THEN** there is no ingest JSON and that candidate stays evaluation-only
