## ADDED Requirements

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
