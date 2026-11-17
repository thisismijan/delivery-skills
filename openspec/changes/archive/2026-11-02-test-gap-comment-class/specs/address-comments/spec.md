## ADDED Requirements

### Requirement: A comment that asks only for a test gets a mutation proof, not a red gate
A comment asking only for a test of behaviour the assessor confirmed is
already correct SHALL be classified `test-gap`. Address-comments SHALL add the
test, run the green gate, and prove with `mutation-proof.ts` that the test
fails when a patch to the source breaks that behaviour, then restore the
source exactly. It SHALL NOT stop for the operator. A comment reporting a real
defect SHALL be a `bug` and keep the red gate.

#### Scenario: Test bites
- **WHEN** a minimal patch breaking the covered behaviour is applied
- **THEN** the new test fails like a red gate, the source is restored, and the comment is answered without a stop

#### Scenario: Test misses the break
- **WHEN** the patched source still passes the new test
- **THEN** the proof fails and the test must be strengthened or the comment escalated

#### Scenario: Unsafe mutation
- **WHEN** the patch touches a test, is empty, does not apply, or the worktree is dirty
- **THEN** the proof is refused
