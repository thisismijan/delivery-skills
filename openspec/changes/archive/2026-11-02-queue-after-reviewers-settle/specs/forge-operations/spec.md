## ADDED Requirements

### Requirement: Forge discussions carry stable authors, comment times, and review events
Forge adapters SHALL report every author as the same stable identity
approvals use: the GitLab username or the GitHub login. `discussions` SHALL
include each comment's creation time, and an `events` list of ready, draft,
approved, unapproved, pushed, and queued changes with actor and time, read
from the change's own history. When any event in that history lacks a time
or actor, `events` SHALL be left out.

#### Scenario: Comment author matches approver
- **WHEN** a reviewer comments and later approves on GitLab
- **THEN** the comment author and the approver are the same username

#### Scenario: Approval reset by a push
- **WHEN** a push resets a reviewer's approval
- **THEN** the events include an unapproved entry for that reviewer

#### Scenario: Incomplete history
- **WHEN** a system note has no time
- **THEN** `events` is absent
