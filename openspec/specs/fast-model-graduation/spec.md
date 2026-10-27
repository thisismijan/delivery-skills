# fast-model-graduation

## Purpose

Keeps unpromoted fast catalogue models evaluation-only until representative scored work for an exact candidate clears the quality bar, safety floors, and an operator promotion approval. An approved candidate may be live while others stay evaluation-only.

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

### Requirement: Unscripted mechanical-edit units have a representative scoring pack

Mechanical-edit units that scripts cannot prove SHALL be listed as representative fixtures for later fast-model scoring. Scoring an exact candidate on that pack SHALL NOT change live catalogue availability. Units a script already applies SHALL NOT be included.

#### Scenario: Unscripted fixtures keep today's worker
- **WHEN** the scoring pack's fixtures are applied through the mechanical-edit helper
- **THEN** each fixture reports `apply: select-model`

#### Scenario: Haiku scores do not promote
- **WHEN** five or more representative-run scores for Haiku on that pack clear the 90 percent bar with no critical misses and there is no operator promotion approval
- **THEN** Haiku remains evaluation-only

#### Scenario: Scripted units are omitted
- **WHEN** the pack is listed
- **THEN** it does not include units a proven script already applies

### Requirement: Test-repo stand-in scores are not graduation evidence

A local identifier rewrite in a temporary git test repo SHALL be recorded with evaluation provenance `test-repo-stand-in`. Fast-model graduation and fast dispatch MUST NOT count those scores. An operator promotion approval MUST NOT make them count.

#### Scenario: Stand-in scores do not fill the sample
- **WHEN** five or more representative-run scores for a candidate exist with provenance `test-repo-stand-in`, utility at or above 90 percent, and no critical misses
- **THEN** the representative sample size is zero and the model remains evaluation-only

#### Scenario: Approval does not promote stand-in scores
- **WHEN** promotion is applied with only `test-repo-stand-in` scores for Haiku and an operator promotion approval that names Haiku
- **THEN** Haiku remains evaluation-only

### Requirement: Unscripted fixtures run as git test repositories

The unscripted mechanical-edit pack SHALL materialize each fixture as an isolated git test repository, prove scripted apply stays `select-model`, and write paired corpus output to a caller-supplied directory. Running that loop SHALL NOT change live catalogue availability.

#### Scenario: Each fixture is a git repository
- **WHEN** the unscripted pack is materialized as test repositories
- **THEN** each fixture root contains a git repository and the listed fixture files

#### Scenario: Scripted apply still keeps today's worker
- **WHEN** the mechanical-edit helper is applied to a materialized test repository
- **THEN** it reports `apply: select-model`

#### Scenario: The loop does not promote Haiku
- **WHEN** the test-repo paired loop writes corpus scores for Haiku
- **THEN** Haiku remains evaluation-only and the live catalogue is unchanged

### Requirement: Captured model-run trees can be scored as graduation evidence

A complete paired capture of a baseline worker and an exact fast catalogue candidate SHALL be scored with provenance `model-run` and source representative-run. Ingest SHALL require that candidate id to appear in the fast catalogue tier. Scoring SHALL NOT change live catalogue availability.

#### Scenario: A complete capture is scored as a model run
- **WHEN** ingest is given a complete paired capture for an unscripted fixture and an exact fast catalogue candidate
- **THEN** the corpus entry uses provenance `model-run` and names that candidate

#### Scenario: Model-run scores still do not promote without approval
- **WHEN** five or more ingested `model-run` scores for an exact fast catalogue candidate clear the 90 percent bar with no critical misses and there is no operator promotion approval
- **THEN** that candidate remains evaluation-only and the live catalogue is unchanged

#### Scenario: A non-fast model is refused
- **WHEN** ingest is asked to score a model that is not in the fast catalogue tier
- **THEN** ingest fails and writes no corpus scores

### Requirement: Incomplete or stand-in captures are refused

Ingest SHALL refuse a capture that is missing required artifacts, uses character-only usage, omits a selected worker model, names the candidate on both runs, or matches the test-repo stand-in rewrite.

#### Scenario: Character-only usage is refused
- **WHEN** ingest is given a capture whose usage is character counts rather than host tokens
- **THEN** ingest fails and writes no corpus scores

#### Scenario: A stand-in rewrite is refused
- **WHEN** ingest is given a capture whose candidate tree is the test-repo stand-in rewrite
- **THEN** ingest fails and writes no corpus scores

#### Scenario: A missing worker name is refused
- **WHEN** ingest is given a capture whose candidate result omits `selectedWorkerModel`
- **THEN** ingest fails and writes no corpus scores

### Requirement: An approved fast candidate may be live while others stay evaluation-only

When representative-run evidence for an exact fast catalogue candidate has cleared the sample size, 90 percent bar, and zero-miss rule, and an operator promotion approval names that candidate, that candidate's catalogue availability MAY be live. Other fast candidates SHALL remain evaluation-only until they receive their own exact approval.

#### Scenario: Spark may be live after exact approval
- **WHEN** the catalogue is loaded after an operator promotion approval naming `muse-spark-1.3-medium`
- **THEN** that candidate is live and `composer-1` and `haiku` remain evaluation-only

#### Scenario: Unapproved fast ids still need evaluation resolve
- **WHEN** live fast resolve is asked with only `composer-1` advertised
- **THEN** resolve fails closed because matching models are evaluation-only

### Requirement: A new exact id can join the fast tier as evaluation-only

Registering a model into the fast catalogue SHALL add that exact id as evaluation-only when it is not already listed. An id that already belongs to frontier or standard MUST be refused. Registering SHALL NOT mark the id live.

#### Scenario: A new id starts evaluation-only
- **WHEN** a previously unseen exact id is registered as a fast candidate
- **THEN** the catalogue lists it as evaluation-only

#### Scenario: A standard-tier id cannot be registered as fast
- **WHEN** register-fast is asked for an id that is already a standard candidate
- **THEN** the catalogue is unchanged and the command fails

### Requirement: Promote writes live availability for the approved exact id

A promote command SHALL evaluate representative-run scores for an exact fast catalogue candidate and write that candidate live only when evidence has cleared and `--approve` names that same id. Other fast candidates SHALL keep their availability. A failed verdict MUST NOT write the catalogue.

#### Scenario: Clearing evidence and exact approval writes only that id live
- **WHEN** promote is given a clearing corpus, a fast catalogue id, and `--approve` of that same id
- **THEN** that candidate is written live and every other fast candidate is unchanged

#### Scenario: Missing approval does not write
- **WHEN** promote is given a clearing corpus without `--approve` of that candidate
- **THEN** the catalogue file is unchanged
