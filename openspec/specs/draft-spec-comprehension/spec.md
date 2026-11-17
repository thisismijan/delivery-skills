# draft-spec-comprehension Specification

## Purpose
Have a fresh reader, isolated from the work item and grooming decisions, explain a drafted change back before it is verified, so a spec that only makes sense with grilling context is revised once or sent to a person instead of reaching the build.

## Requirements

### Requirement: Draft runs explain-back before verifying a change
After the approach challenge step and before artifact verification, `/draft` SHALL dispatch one read-only explain-back reviewer that sees only the OpenSpec change and the repository files it references. The reviewer SHALL never receive the work item or grooming decisions. The reviewer SHALL restate the problem, the behaviour of each requirement, and how the touched code works today. Any question it cannot answer from those files SHALL be a gap. `draft-route.ts comprehension` SHALL route a clean restatement to proceed, gaps or a contradictory restatement on attempt 1 to one revision of the change then a second check, and a second failure to exit 3 for a person. A missing or malformed verdict SHALL stop the draft. The check SHALL run on every draft at the standard model tier, including when the approach challenge was skipped for low complexity.

#### Scenario: Spec relies on grilling-only context
- **GIVEN** a drafted change that relies on context only grilling had
- **WHEN** explain-back runs
- **THEN** draft reports each gap and does not reach artifact verification

#### Scenario: Second failure escalates
- **GIVEN** explain-back fails again after one spec revision
- **WHEN** draft routes the verdict
- **THEN** draft posts one note naming the gaps and stops for a person with the declared draft stop id for unsettled comprehension

#### Scenario: Malformed verdict fails closed
- **GIVEN** a missing or malformed explain-back verdict
- **WHEN** draft routes it
- **THEN** draft stops

#### Scenario: Reader isolation
- **GIVEN** an explain-back dispatch
- **WHEN** the reviewer is started
- **THEN** its prompt lists only the change directory and named referenced paths, excludes the work item, grooming decisions, and change metadata that carries the work-item key, and a denied path read is treated as a gap rather than evidence

#### Scenario: Runs after a skipped approach challenge
- **GIVEN** feasibility rated the change low complexity so the approach challenge was skipped
- **WHEN** draft reaches post-authoring checks
- **THEN** explain-back still runs before artifact verification

#### Scenario: Revision regenerates tasks under isolation
- **GIVEN** explain-back returns gaps on attempt 1
- **WHEN** draft revises the change
- **THEN** it regenerates tasks.md, keeps the same isolated inputs for attempt 2, and does not feed the work item into the revised artifacts in a way the reader cannot see

### Requirement: Explain-back verdict schema is strict and fail closed
`verdicts.ts` SHALL define a strict explain-back verdict with values for understood, gaps, and misread. An understood verdict SHALL include a non-empty restatement of the problem, each requirement's behaviour, and how the touched code works today. A gaps verdict SHALL list at least one gap with a question and the file that should have answered it. A misread verdict SHALL name the contradiction between the restatement and the change files. A clean verdict with an empty restatement, gaps with an empty list, or misread without a contradiction SHALL be refused. The draft command, which has both the change and the work item, SHALL be the actor that marks a restatement as a misread when it contradicts the change files; the reader itself SHALL NOT receive the work item to perform that comparison.

#### Scenario: Contradictory or empty verdict refused
- **WHEN** a verdict says understood with an empty restatement, or gaps with no gaps listed, or misread without a contradiction
- **THEN** the verdict is refused and the draft stops

#### Scenario: Misread owned by draft command
- **GIVEN** the reader's restatement contradicts the change files
- **WHEN** draft evaluates the verdict
- **THEN** it treats the result as a misread requiring revision, without sending the work item to the reader

### Requirement: Unsettled comprehension is a declared draft stop
The SDLC constitution draft stops SHALL include a stop id for unsettled comprehension. An explain-back escalation SHALL use that stop id.

#### Scenario: Constitution names the stop
- **WHEN** the constitution draft stops are read
- **THEN** they include the unsettled-comprehension stop id used by explain-back escalation
