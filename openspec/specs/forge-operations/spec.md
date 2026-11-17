# forge-operations

## Purpose

Provides portable, deterministic change inspection and review publication
across forge products while preserving human-owned delivery boundaries.

## Requirements

### Requirement: Forge changes have normalized identities and metadata
The system SHALL expose provider-neutral find and read operations whose results
include provider identity, opaque change reference, state, branches, revisions,
title, description, author, URL, current-head pipeline evidence, and
mergeability.

#### Scenario: Change is found by source branch
- **WHEN** a caller finds open changes for a source branch
- **THEN** the provider returns validated normalized change summaries without product-specific fields

#### Scenario: Adapter returns an invalid change
- **WHEN** an adapter exits successfully with malformed or incomplete output
- **THEN** the operation fails closed and does not invent metadata

### Requirement: Review evidence is available through normalized views
The system SHALL expose changed-file summaries, unified diff, commits,
discussions, valid inline anchors, and revision references through normalized
operations.

#### Scenario: Review context is complete
- **WHEN** a review requests each evidence view for a change
- **THEN** each result is schema-validated and bound to the requested change and head revision

#### Scenario: Session-tool evidence lacks the read head
- **WHEN** a session tool returns files, diff, commits, discussions, or anchors without an input bound to the full head revision from the preceding normalized change read
- **THEN** normalization fails instead of inventing a revision label

#### Scenario: Diff is truncated
- **WHEN** the forge reports that a diff is incomplete or overflowed
- **THEN** the provider refuses the diff instead of returning partial review evidence

### Requirement: Pipeline evidence is revision-bound
The system SHALL expose a read-only pipeline operation for an exact revision,
including the merged revision on the default branch. Available evidence SHALL
name the same revision requested by the caller.

#### Scenario: Default-branch pipeline is queried after merge
- **WHEN** delivery requests pipeline evidence for the normalized merged revision
- **THEN** the provider returns status for exactly that revision or explicitly reports that evidence is not available

#### Scenario: Provider returns another revision
- **WHEN** pipeline output names a revision other than the requested revision
- **THEN** the operation fails closed and delivery does not treat it as passing evidence

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

### Requirement: Forge adapters use a shell-free executable protocol
Available forge and review capabilities SHALL identify a provider and an
absolute executable that accepts a named operation, a versioned JSON request on
stdin, and returns versioned normalized JSON on stdout.

#### Scenario: Adapter process fails
- **WHEN** an adapter exits non-zero
- **THEN** the command reports a sanitized provider failure without exposing stderr or credentials

#### Scenario: Capability providers disagree
- **WHEN** review publication and change inspection advertise different provider identities for one operation
- **THEN** delivery stops with a provider configuration remedy

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

### Requirement: Failed-job evidence is bound to the change head
The `failures` operation SHALL return the newest pipeline at the change's
current head, or `available: false` when the newest pipeline is not at that
head. Each failed job SHALL carry its id, name, forge failure reason when
known, the number of times a job of that name has run in the pipeline, and
the end of its log when the forge returns it. A merge train pipeline SHALL
say how many train pipelines in a row have failed for the head.

#### Scenario: A job retried once
- **WHEN** a job has failed, been retried, and failed again in the pipeline
- **THEN** its failed-job evidence has attempt 2

#### Scenario: The head has moved
- **WHEN** `failures` is asked for a head the change no longer has
- **THEN** it fails instead of returning evidence for another revision

### Requirement: CI is retried once, and only for infrastructure
The `retry` operation SHALL retry a failed pipeline only when the frozen run
contract checks and sets `ciRetry.infrastructure` to 1, every failed job is
classified as infrastructure, no failed job is a deploy job, and nothing has
already been retried for the head. Otherwise it SHALL stop with plain reasons
for the operator.

#### Scenario: A first infrastructure failure
- **WHEN** a runner failure fails the pipeline and the contract allows one retry
- **THEN** that job is retried and the result names it

#### Scenario: A repeat after the retry
- **WHEN** the same infrastructure failure happens again after its retry
- **THEN** the run stops and goes to the operator

#### Scenario: A test failure
- **WHEN** a test job fails and its log shows no infrastructure cause
- **THEN** nothing is retried, whatever the contract allows

#### Scenario: No retry policy
- **WHEN** the run contract has no `ciRetry`
- **THEN** nothing is retried and the run stops for the operator

### Requirement: A retry runs through the adapter and re-adds a failed train
The `retry` operation SHALL run only through the executable adapter, never
through session tools. For a failed merge train pipeline it SHALL re-add the
change to the train at the guarded head instead of retrying the train's jobs.

#### Scenario: Session tools
- **WHEN** a retry is planned or normalized for session tools
- **THEN** it is refused

#### Scenario: A failed merge train
- **WHEN** a merge train pipeline fails for the first time on infrastructure
- **THEN** the change is re-added to the merge train

### Requirement: The failure classifier is measured on held-out jobs
The CI failure classifier SHALL be tested against labelled real jobs it was
never changed against, as well as the sets it was fixed against. No labelled
job that is not infrastructure SHALL be classified as infrastructure. A miss on
the held-out set SHALL be recorded and kept, not fixed in place.

#### Scenario: A job id followed by "failed"
- **WHEN** a build log says an image tagged with a job id "failed"
- **THEN** that line is not read as a test runner's failure count

#### Scenario: A recorded held-out miss
- **WHEN** the classifier is changed so that a recorded held-out miss now matches
- **THEN** the held-out test fails and asks for freshly labelled jobs before that kind is counted as handled
