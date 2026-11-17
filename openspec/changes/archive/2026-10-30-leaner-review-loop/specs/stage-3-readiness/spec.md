## REMOVED Requirements

### Requirement: Address-comments holdout does not mark a new head ready
**Reason**: address-comments no longer runs a holdout review.
**Migration**: The draft-and-status rule now applies to every comment round, as the new requirement below says.

## ADDED Requirements

### Requirement: A comment round does not mark a new head ready
After comments are addressed, the merge request SHALL stay draft and status
SHALL become `[addressed !N]`. Only Stage 3 review SHALL undraft it or write a
ready review verdict.

#### Scenario: Cumulative gates pass after addressing comments
- **WHEN** comments are addressed on a new head and the cumulative gates pass
- **THEN** the merge request remains draft
- **AND** status becomes `[addressed !N]`
