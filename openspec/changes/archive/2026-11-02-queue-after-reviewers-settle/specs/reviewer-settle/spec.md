## ADDED Requirements

### Requirement: A change is queued only after its reviewers settle
The land gate SHALL run the settle check in the same step that merges. The
check SHALL return `unanswered` when a reviewer comment has no reply and is not
only an acknowledgement. It SHALL return `settled` when every reviewer who
commented approved the current head after the last reply.

#### Scenario: Unanswered comment
- **WHEN** a reviewer comment has no reply
- **THEN** the land gate stops and names the comments

#### Scenario: Reviewer approved after the last reply
- **WHEN** the only commenting reviewer approved the current head after the last reply
- **THEN** the change is queued without waiting

### Requirement: Without approvals, a quiet window must pass
When some commenting reviewer has not approved after the last reply, the check
SHALL return `settled` only once `REVIEW_SETTLE_MINUTES` reviewing minutes have
passed since the latest of leaving draft, the last push, and the last comment.
Minutes inside `REVIEW_QUIET_HOURS` SHALL NOT count. Before that it SHALL return
`wait` with the settle time.

#### Scenario: Queued right after leaving draft
- **WHEN** the recorded events of !976, !989, !995, !1000, !1012, !1001, and !1032 are replayed at the moment each was queued
- **THEN** each is held back with a wait, and !978 and !987 are held back as unanswered

#### Scenario: Overnight
- **WHEN** a change leaves draft ten minutes before quiet hours begin
- **THEN** it settles twenty reviewing minutes after quiet hours end

### Requirement: An undecidable wait goes to the operator
When the forge does not report the change's history, approvals, or comment
times, or the history does not show when the change last left draft, the check
SHALL return `ask` with a plain reason and the land gate SHALL stop.

#### Scenario: History missing
- **WHEN** `events` is absent or approvals are unavailable
- **THEN** the land gate stops and says why
