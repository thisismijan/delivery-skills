## REMOVED Requirements

### Requirement: Unchanged code is not sent through duplicate holdout review
**Reason**: address-comments no longer runs a holdout review; Stage 3 reviews every round's fixes.
**Migration**: The unchanged-head skip now applies to the cumulative gates only, as the new requirement below says.

## ADDED Requirements

### Requirement: A comment round runs the cumulative gates and no review of its own
After a round that changed the head, or when a pending marker existed on
entry, `/address-comments` SHALL run the cumulative tests, lint, and typecheck
and SHALL NOT dispatch a holdout reviewer. When the head is unchanged and no
pending marker existed, it SHALL skip the cumulative gates. Either way it
SHALL leave the change draft for Stage 3.

#### Scenario: A fix changes the head
- **WHEN** addressing a comment creates a commit
- **THEN** the cumulative gates run, no holdout reviewer is dispatched, and the change stays draft

#### Scenario: Replies do not change the head
- **WHEN** comments are answered or disputed without a commit and no pending marker exists
- **THEN** the cumulative gates are skipped and Stage 3 review remains required

### Requirement: A later review round reads only what changed when that is safe
`review-scope.ts` SHALL return `delta` only when an earlier review with a
verdict exists in the branch's history, no merge commit followed it, the
change since then touches no sensitive surface, dependency, one-way step, or
weakened test, stays within 6 files and under 400 lines, touches only files
the earlier review covered, and the level is not `max`. Otherwise it SHALL
return `full` with its reasons. In `delta`, the correctness pass SHALL confirm
each earlier finding is fixed.

#### Scenario: Small fix to a reviewed file
- **WHEN** the only change since the last review is a small edit to a file it covered
- **THEN** the scope is `delta` since that review's commit

#### Scenario: Change that needs a full review
- **WHEN** the change since the last review adds a file, touches a dependency, or the branch merged the base
- **THEN** the scope is `full` and names why

#### Scenario: No usable earlier review
- **WHEN** there is no earlier review, or it is outside the branch's history
- **THEN** the scope is `full`
