## ADDED Requirements

### Requirement: An older run contract fails with a way forward
When a frozen run contract names a human-owned action the live constitution no
longer has, reading it SHALL fail with a message naming that action, the
contract hash, and the supersede command. `check`, `level`, and the land gate
SHALL report that as a normal failed result, not a crash. A contract frozen
under another constitution SHALL name the supersede command too.

#### Scenario: Retired human-owned action
- **WHEN** a contract frozen with `tracker-status` as human-owned is checked
- **THEN** the result is not ok and names `tracker-status` and the supersede command

#### Scenario: Different constitution
- **WHEN** a contract parses but its constitution hash is not the live one
- **THEN** the result is not ok and names the supersede command

#### Scenario: Tampered contract
- **WHEN** a contract's body no longer matches its hash
- **THEN** it fails as a hash mismatch, not as an older contract

### Requirement: An older run contract can be superseded
`supersede` SHALL accept an older contract whose hash matches its body as the
current contract. The proposal SHALL still be frozen under the live
constitution with a higher plan version, the superseded hash, a reason, the
affected invariant, and a new approval.

#### Scenario: Superseding an older contract
- **WHEN** a valid new plan version supersedes a contract frozen under an older constitution
- **THEN** `supersede` accepts it

#### Scenario: Proposal without a new approval
- **WHEN** the proposal reuses the old approval time
- **THEN** `supersede` refuses it
