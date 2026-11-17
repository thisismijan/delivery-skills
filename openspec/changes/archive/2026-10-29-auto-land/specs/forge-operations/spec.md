## MODIFIED Requirements

### Requirement: Destructive lifecycle actions remain human-owned
The normalized forge interface SHALL NOT expose merge, close, delete, approve,
or discussion-resolution operations. The only way the factory merges is the
gated `land` operation, and only inside a continuous auto run.

#### Scenario: Delivery reaches merge readiness
- **WHEN** all automated review and readiness gates pass outside a continuous auto run
- **THEN** delivery reports readiness and leaves merge or close actions to a human

#### Scenario: A raw merge is requested
- **WHEN** a caller requests the `merge` operation from the forge provider or an adapter
- **THEN** the request is refused as human-owned

## ADDED Requirements

### Requirement: Approval evidence is revision-bound
The `approvals` operation SHALL return who approved the change, whether every
approval rule is met, and the head it was read at. A forge that cannot report
approvals SHALL return unavailable evidence, never an assumed approval.

#### Scenario: Approved change
- **WHEN** a person approved the change and the forge reports no approvals left
- **THEN** the evidence is available, approved, and names the approver

#### Scenario: Approval rules not yet met
- **WHEN** the forge reports approvals still required, or no one approved
- **THEN** the evidence is available and not approved

### Requirement: Auto lands a change only through the land gate
The `land` operation SHALL read the change, its approvals, and its discussions
through the executable adapter, decide `landed`, `wait`, or `stop` from that
evidence plus the run ledger and the frozen run contract, and squash-merge with
the exact head as a guard only when every check holds for the same head.
`land` SHALL NOT run through session tools.

#### Scenario: Approved and green
- **WHEN** the change is open, not a draft, approved, green and conflict-free at the head the ledger's readiness GO names, no comment arrived after the GO, the ledger records continuous delivery, and the run contract permits the land stage for the ticket
- **THEN** the adapter squash-merges with that head as its guard and the result is `landed` with the merged revision

#### Scenario: Pipeline still running or approval missing
- **WHEN** the head pipeline is still running, mergeability is still being computed, or the change is not yet approved
- **THEN** the result is `wait` with the reason and nothing is merged

#### Scenario: Evidence missing, stale, or contradictory
- **WHEN** the head moved since the GO, the pipeline failed, the change conflicts, a new comment arrived, the ledger has no continuous-delivery approval or GO at that head, or the run contract does not permit the land stage
- **THEN** the result is `stop` with the reason and nothing is merged

#### Scenario: Archive change
- **WHEN** an archive change is approved, green, conflict-free, and touches only files under `openspec/`
- **THEN** it lands without a readiness verdict; a file outside `openspec/` stops it

#### Scenario: Session tools only
- **WHEN** `land` is planned and no executable adapter is advertised
- **THEN** the plan refuses, and the merge stays with a person
