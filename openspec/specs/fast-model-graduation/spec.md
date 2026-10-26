# fast-model-graduation

## Purpose

Keeps fast catalogue models evaluation-only until representative scored work for an exact candidate clears the quality bar, safety floors, and an operator promotion approval.

## Requirements

### Requirement: Only representative exact-candidate scores count as graduation evidence

Fast-model graduation and fast dispatch SHALL count scored corpus entries only when the recorded source is representative-run and the evaluation names the exact candidate under consideration. Live evidence MUST NOT be mixed into that sample. Scores for a different candidate MUST NOT count.

#### Scenario: Mixed live and representative evidence is not enough
- **WHEN** promotion or fast dispatch is evaluated with fewer than five representative-run scores for the candidate and enough live scores that the combined count would meet the sample bar
- **THEN** the representative sample stays below five and the model remains evaluation-only

#### Scenario: Live-only scores do not count
- **WHEN** five or more live scores exist for the candidate and there are no representative-run scores
- **THEN** the representative sample size is zero and the model remains evaluation-only

#### Scenario: A different candidate's scores do not count
- **WHEN** enough representative-run scores exist for one candidate and dispatch is evaluated for another
- **THEN** the second candidate is not treated as having cleared the bar

### Requirement: Insufficient scored reversible work keeps the model evaluation-only

A fast model SHALL remain evaluation-only when it has fewer than five representative-run scores on reversible work, when mean relative utility is below 90 percent, or when any counted score has a critical miss. The 90 percent bar MUST NOT be lowered.

#### Scenario: Fewer than five representative cases
- **WHEN** promotion is evaluated with four representative-run scores at or above 90 percent and no critical misses
- **THEN** the model remains evaluation-only

#### Scenario: Utility below 90 percent
- **WHEN** promotion is evaluated with five representative-run scores whose mean relative utility is below 90 percent and there are no critical misses
- **THEN** the model remains evaluation-only

#### Scenario: Any critical miss
- **WHEN** promotion is evaluated with five representative-run scores at or above 90 percent and one of them has a critical miss
- **THEN** the model remains evaluation-only

#### Scenario: The 90 percent bar is not reduced
- **WHEN** five representative-run scores average 89 percent with no critical misses
- **THEN** the model remains evaluation-only

### Requirement: Named safety floors block listed task kinds from fast dispatch

Fast dispatch SHALL refuse auth, migration, concurrency, distributed-state, weak-verification, and holdout tasks. The refusal SHALL name the floor that applied. Clearing the quality bar MUST NOT override a named floor.

#### Scenario: Auth work is blocked
- **WHEN** fast dispatch is considered for a task whose domains include auth
- **THEN** dispatch is refused and the reason names the auth floor

#### Scenario: Migration work is blocked
- **WHEN** fast dispatch is considered for a task whose domains include migration
- **THEN** dispatch is refused and the reason names the migration floor

#### Scenario: Concurrency work is blocked
- **WHEN** fast dispatch is considered for a task whose domains include concurrency
- **THEN** dispatch is refused and the reason names the concurrency floor

#### Scenario: Distributed-state work is blocked
- **WHEN** fast dispatch is considered for a task whose domains include distributed-state
- **THEN** dispatch is refused and the reason names the distributed-state floor

#### Scenario: Weak-verification work is blocked
- **WHEN** fast dispatch is considered for a task whose verification strength is weak
- **THEN** dispatch is refused and the reason names the weak-verification floor

#### Scenario: Holdout review is blocked
- **WHEN** fast dispatch is considered for a holdout review task
- **THEN** dispatch is refused and the reason names the holdout floor

#### Scenario: A named floor still blocks after the quality bar clears
- **WHEN** the exact candidate has five representative-run scores at or above 90 percent with no critical misses and the task is one of the listed kinds
- **THEN** dispatch is still refused

### Requirement: Live availability changes only with exact operator promotion approval

Even when representative-run evidence for the named candidate clears the sample size, 90 percent bar, and zero-miss rule, live catalogue availability SHALL remain unchanged unless an operator promotion approval names that exact candidate. An approval for a different candidate MUST NOT change this candidate's availability.

#### Scenario: Passing evidence without approval leaves availability unchanged
- **WHEN** promotion is applied with clearing representative-run evidence and no operator promotion approval
- **THEN** the candidate's live availability is unchanged and remains evaluation-only

#### Scenario: Approval for another candidate leaves availability unchanged
- **WHEN** promotion is applied with clearing evidence for one candidate and an approval that names a different candidate
- **THEN** the first candidate's availability is unchanged

#### Scenario: Exact approval can mark the candidate live
- **WHEN** promotion is applied with clearing representative-run evidence and an operator promotion approval that names that exact candidate
- **THEN** that candidate's availability may become live

### Requirement: Rankings and fixtures never promote a fast model

Public rankings, benchmark tables, and unscored representative fixtures MUST NOT count as graduation evidence and MUST NOT change live availability.

#### Scenario: Public rankings do not promote
- **WHEN** promotion is evaluated with a public ranking that places the candidate first and without representative-run scores that clear the bar
- **THEN** the model remains evaluation-only

#### Scenario: Unscored fixtures do not promote
- **WHEN** promotion is evaluated from the representative routing fixtures with no scores
- **THEN** the model remains evaluation-only

### Requirement: Classified mechanical edits may be fast-eligible

A task whose work type is mechanical-edit SHALL be fast-eligible when it is reversible, local, a known pattern, strongly verified, and not blocked by a named safety floor. Search, classify, and summarise remain fast-eligible under the existing rules. Ordinary implement and write-tests SHALL still sit at least at the standard floor. Classifying a mechanical-edit SHALL NOT mark a fast catalogue model live.

#### Scenario: A classified mechanical-edit can be fast-eligible
- **WHEN** a task is a mechanical-edit, reversible, local, known-pattern, and strongly verified, with no named safety domain
- **THEN** fast eligibility holds for shadow routing and later graduation scoring

#### Scenario: Ordinary implement stays off the fast floor
- **WHEN** a task is implement or write-tests
- **THEN** the routing floor remains at least standard

#### Scenario: Auth mechanical-edit is still blocked
- **WHEN** a mechanical-edit task includes the auth domain
- **THEN** fast dispatch is refused and the reason names the auth floor

#### Scenario: Classifying mechanical-edit does not promote Haiku
- **WHEN** mechanical-edit units exist and Haiku has no exact operator promotion approval
- **THEN** Haiku remains evaluation-only
