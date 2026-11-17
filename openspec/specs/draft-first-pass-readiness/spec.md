# draft-first-pass-readiness Specification

## Purpose
Have a fresh reviewer judge whether an implementer could succeed on the first pass from a drafted change alone, so an untestable scenario, a missing file, an unnamed interface, or a task list that contradicts the specs is caught before the build.

## Requirements

### Requirement: Draft runs a first-pass readiness check after explain-back
After the explain-back check has routed to proceed, and before artifact verification, `/draft` SHALL dispatch one fresh, read-only reviewer on the frontier model tier. The reviewer SHALL answer one question about the drafted change and nothing else: could an implementer succeed on the first pass from this change alone? The reviewer SHALL judge the change, never the ticket. `/draft` SHALL NOT start artifact verification until the readiness check has routed to proceed, or has been skipped for low complexity. When explain-back escalates, the readiness check SHALL NOT run. The step lives in `skills/draft/SKILL.md`, after step 7b and before step 8, and the reviewer is the read-only agent `factory/agents/first-pass-reviewer.md` (new) with the tools Read, Grep, and Glob only.

#### Scenario: Order of gates
- **GIVEN** a draft that has passed the approach challenge step
- **WHEN** the draft skill's post-authoring steps are read in order
- **THEN** explain-back comes first, the readiness step comes after explain-back proceeds, and artifact verification comes only after the readiness step proceeds or is skipped

#### Scenario: The reviewer is asked one question about the change
- **GIVEN** the reviewer's agent file and the readiness verdict schema
- **WHEN** they are read
- **THEN** the agent file asks only whether an implementer could succeed on the first pass from the change alone, and the verdict schema has no item kind for style, naming, or the merit of the ticket, so such a finding cannot be expressed

#### Scenario: Reviewer runs on the frontier tier and is read-only
- **GIVEN** a medium or high complexity draft reaching the readiness step
- **WHEN** the reviewer is dispatched
- **THEN** the exact available frontier model is used, and the agent's tools are Read, Grep, and Glob with no write, shell, or tracker tools

### Requirement: Four findings make a change not ready and each is reported
A readiness verdict SHALL be not ready when the reviewer finds any of: an untestable scenario, a checked file path that is neither present in the repository nor marked new in the change, an unnamed interface, or a contradiction between `tasks.md` and the specs or design. Each finding SHALL be its own item in the verdict, so one verdict can carry several. The reviewer's agent file SHALL state these four definitions and no others. A scenario is untestable when it lacks a WHEN or a THEN, or its THEN states no outcome a test could observe, or it needs a live model or a person to judge. An interface is unnamed when a function, type, command mode, exit code, configuration key, file format, or stop id that the change needs is described only in words and never by the identifier an implementer would type. A task contradiction is a task that proves a scenario the specs do not contain, a scenario with no matching task, or a task that names a path or interface different from the one the design names.

A path is checked only when it is written in backticks, is repository-relative, contains at least one slash, ends in one of the extensions `.ts`, `.md`, `.json`, `.yml`, `.yaml`, `.py`, `.java`, `.sh`, `.toml`, or `.xml`, and contains no angle bracket. A path that starts with `.review/`, `.delivery/`, `/`, or `<`, a path with an angle-bracket placeholder, a runtime scratch file (any path whose last segment is `skipped-workers.json`), and a bare filename with no directory SHALL NOT be checked. A checked path is marked new when the proposal's Impact section or `design.md` writes it in backticks followed after one space by the literal text `(new)`. A checked path is present when a Read of that exact path, relative to the repository root named in the dispatch, succeeds. The reviewer SHALL NOT use Glob or Grep to decide presence, so the answer is the same inside an ignored worktree folder as in a normal checkout. The draft step SHALL list the checked paths in the dispatch by this rule, and the agent file SHALL repeat the rule.

#### Scenario: Each finding kind routes to a revision
- **GIVEN** a hand-written not-ready verdict whose item is an untestable scenario, a missing file, an unnamed interface, or a task contradiction
- **WHEN** it is routed on attempt 1
- **THEN** each kind routes to revise with the item named in the reason, and the draft skill says a not-ready verdict does not continue to artifact verification

#### Scenario: The agent file states the four definitions
- **GIVEN** the reviewer's agent file
- **WHEN** it is read
- **THEN** it defines an untestable scenario, a missing file, an unnamed interface, and a task contradiction as above, and defines no other not-ready cause

#### Scenario: A verdict can carry several items
- **GIVEN** a hand-written not-ready verdict with an untestable scenario item and a missing file item
- **WHEN** it is parsed and routed on attempt 1
- **THEN** it parses, and the revise reason names both items

#### Scenario: An existing path inside an ignored worktree is found
- **GIVEN** a draft running inside a worktree folder that version control ignores, and a change that names an existing repository file
- **WHEN** the reviewer decides whether the path is present
- **THEN** the agent file says presence is decided by a successful Read of the exact path and never by Glob or Grep, so the existing file is found and is not reported as missing

#### Scenario: A placeholder path is not checked
- **GIVEN** a change that names a path with an angle-bracket placeholder, such as a change folder written with a placeholder for its name
- **WHEN** the draft step lists the checked paths
- **THEN** the placeholder path is not in the list, and the agent file says a path with an angle bracket is never reported as missing

#### Scenario: A scratch path or bare filename is not checked
- **GIVEN** a change that names a path starting with `.review/` or `.delivery/`, a `skipped-workers.json` file, or a bare filename with no directory
- **WHEN** the draft step lists the checked paths
- **THEN** none of them is in the list, and the agent file says none of them is reported as missing

#### Scenario: A denied or failed read of an existing path is a missing file item
- **GIVEN** a checked path that is not marked new and whose Read fails
- **WHEN** the reviewer forms its verdict
- **THEN** the verdict is not ready, with a missing file item whose detail says the path is not present or could not be read and gives the reason, and no other item kind is used for a failed read

#### Scenario: A path marked new is never read
- **GIVEN** a checked path that does not exist and is written in the design in backticks followed by `(new)`
- **WHEN** the reviewer forms its verdict
- **THEN** the path is not read, so it is never a denied read, and it is not reported as missing

### Requirement: A not ready verdict gets one revision, then a person decides
`factory/scripts/draft-route.ts` SHALL provide a `readiness` mode, with a `routeReadiness` function, that routes a readiness verdict by attempt number. A ready verdict SHALL route to proceed. A not ready verdict on attempt 1 SHALL route to one revision of the change followed by a second check as attempt 2. A not ready verdict on attempt 2 SHALL route to escalate with exit 3. An attempt outside 1 to 2 SHALL be refused. A revision SHALL fix every reported item, SHALL regenerate `tasks.md` with `generate-tasks.ts` before the second attempt, and SHALL give the second reviewer the same isolated inputs as the first. On escalation, draft SHALL post one note through the provider naming each reported item, SHALL stop with the stop id `unready-change`, and SHALL NOT verify, commit, or post the spec-ready note.

#### Scenario: First not ready verdict triggers one revision
- **GIVEN** a not ready verdict on attempt 1
- **WHEN** draft routes the verdict
- **THEN** the action is revise, each item is reported, and the change is revised before a second check

#### Scenario: Revision regenerates the task list before the second attempt
- **GIVEN** a revision after a not ready verdict
- **WHEN** draft prepares attempt 2
- **THEN** the draft skill says `tasks.md` is regenerated from the revised specs, never edited by hand, and the second reviewer receives the same isolated inputs as the first

#### Scenario: Second not ready verdict escalates to a person
- **GIVEN** the readiness verdict is not ready again after one revision
- **WHEN** draft routes the verdict
- **THEN** the action is escalate with exit 3, one note names each reported item, draft stops with the stop id `unready-change`, and artifact verification is not reached

#### Scenario: A ready verdict proceeds
- **GIVEN** a ready verdict on attempt 1, or on attempt 2 after a revision
- **WHEN** draft routes the verdict
- **THEN** the action is proceed and draft continues to artifact verification

#### Scenario: Attempt out of bounds is refused
- **WHEN** the readiness route is given an attempt below 1 or above 2
- **THEN** it refuses with an error and routes nothing

### Requirement: Low complexity work skips the readiness check and records the skip
When the feasibility complexity signal for the work is low, `/draft` SHALL NOT dispatch the reviewer and SHALL NOT run the readiness route. It SHALL instead record the skip by writing a skipped-workers file naming the worker `first-pass-reviewer` with the skip id `first-pass-reviewer-<work-item-key>`, persisting it with `factory/scripts/record-skip.ts`, and refreshing the routing scorecard, then continue to artifact verification. `SKIPPED_WORKERS` in `factory/scripts/record-skip.ts` SHALL include `first-pass-reviewer` and SHALL still include the existing worker name `readiness-lens`, so the two names are distinct. No other condition SHALL skip the check. `factory/scripts/record-skip.ts` SHALL need no change beyond that worker name. When persisting the skip exits 1 with the refusal `skip id already recorded: first-pass-reviewer-<work-item-key>`, which happens when the same work item is drafted again, `/draft` SHALL treat the skip as recorded and continue. Any other persist failure SHALL stop the draft, and `/draft` SHALL NOT invent a different skip id.

#### Scenario: Low complexity skips and records the skip
- **GIVEN** feasibility rated the work low complexity
- **WHEN** draft reaches the readiness step
- **THEN** no reviewer is dispatched, the skip is persisted with `record-skip.ts` under the worker `first-pass-reviewer` and the skip id `first-pass-reviewer-<work-item-key>`, and draft continues to artifact verification

#### Scenario: Medium and high complexity are never skipped
- **GIVEN** feasibility rated the work medium or high complexity
- **WHEN** draft reaches the readiness step
- **THEN** the reviewer is dispatched, and no skip is recorded

#### Scenario: Worker name does not collide
- **WHEN** the closed list of skippable workers is read
- **THEN** it contains `first-pass-reviewer` and `readiness-lens` as separate names, and a skip recorded for the new name is accepted

#### Scenario: An already recorded skip id does not stop a re-draft
- **GIVEN** the skip id `first-pass-reviewer-<work-item-key>` was recorded by an earlier draft of the same work item
- **WHEN** a low complexity re-draft persists the skip and receives the already-recorded refusal
- **THEN** draft treats the skip as recorded and continues to artifact verification, without stopping and without using a different skip id, and the draft skill says any other persist failure stops the draft

### Requirement: Readiness verdict schema is strict and fail closed
`factory/scripts/verdicts.ts` SHALL define a strict readiness verdict with the values `ready` and `not_ready`, and a parser for it. A ready verdict SHALL carry a non-empty reasoning and no items. A not ready verdict SHALL carry at least one item. Each item SHALL have a kind (one of untestable scenario, missing file, unnamed interface, or task contradiction), a non-empty location, and a non-empty detail. A ready verdict with items, a not ready verdict with no items, an empty reasoning, an unknown kind, or any extra key SHALL be refused. A missing or malformed verdict SHALL stop the draft, SHALL NOT be retried with a fresh agent, and SHALL NOT be treated as a pass.

#### Scenario: Malformed verdict stops the draft
- **GIVEN** a missing, unparseable, or schema-invalid readiness verdict
- **WHEN** draft routes it
- **THEN** the route exits 1, draft posts one note naming the validation failure and stops, and no fresh agent is dispatched to retry

#### Scenario: Contradictory verdict shapes are refused
- **WHEN** a verdict says ready with items, or not ready with no items, or has an empty reasoning, or an unknown item kind
- **THEN** the verdict is refused and the draft stops

#### Scenario: Valid verdicts are accepted
- **WHEN** a verdict says ready with a reasoning and no items, or not ready with at least one fully described item
- **THEN** the verdict parses and routes by its value

### Requirement: The reviewer sees the change and checked paths only
The readiness dispatch SHALL list only the change directory `openspec/changes/<change>/` (including `tasks.md`) and the checked paths. It SHALL exclude the change metadata file that carries the work-item key. The reviewer SHALL NOT receive the work item, grooming decisions, grilling history, or anything under the draft review scratch folder.

#### Scenario: Reader isolation
- **GIVEN** a readiness dispatch
- **WHEN** the reviewer is started
- **THEN** its prompt lists only the change directory and the checked paths, and excludes the work item, grooming decisions, draft review scratch, and the change metadata file that carries the work-item key

### Requirement: Unready change is a declared draft stop distinct from unsettled comprehension
The SDLC constitution in `skills/delivery/sdlc-constitution.json` SHALL list `unready-change` among the draft stops, and a readiness escalation SHALL use that stop id. It SHALL be a different id from `unsettled-comprehension`, which the explain-back escalation uses, and both SHALL remain listed.

#### Scenario: Constitution names two distinct stops
- **WHEN** the constitution draft stops are read
- **THEN** they include `unready-change` and `unsettled-comprehension` as two separate ids, and the draft skill uses `unready-change` for a readiness escalation and `unsettled-comprehension` for an explain-back escalation

### Requirement: Contributor docs and step-order tests describe the readiness step
`factory/CONVENTIONS.md` and `docs/reference.md` SHALL describe the first-pass reviewer as a read-only frontier subagent, the readiness step between explain-back and verification, its single revision and escalation, its low complexity skip, and the `unready-change` stop. The existing step-order assertions in `factory/scripts/workflow-contracts.test.ts` and `factory/scripts/explain-back.test.ts` SHALL be updated so explain-back precedes readiness and readiness precedes verification.

#### Scenario: Docs and step-order assertions name the new step
- **WHEN** the contributor docs and the existing draft step-order assertions are read
- **THEN** the docs name the `first-pass-reviewer` agent, the `readiness` route mode, the `unready-change` stop, and the low complexity skip, and the assertions require explain-back before readiness and readiness before artifact verification
