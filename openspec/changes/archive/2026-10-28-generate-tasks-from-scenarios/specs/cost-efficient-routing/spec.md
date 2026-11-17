## ADDED Requirements

### Requirement: Task lists are generated from spec scenarios

When `/draft` has written the delta specs, it SHALL generate `tasks.md`
with `generate-tasks.ts` and SHALL NOT ask a model to invent the task
list. The file SHALL contain one test task per `Scenario` heading, then
an implementation task. Missing specs or a spec with no scenarios SHALL
fail closed and write nothing.

#### Scenario: Scenarios become tests-first tasks
- **WHEN** the change specs contain two scenarios
- **THEN** `tasks.md` lists two test tasks before implementation
- **AND** no model is asked to write the task list

#### Scenario: A spec without scenarios is refused
- **WHEN** the specs directory has no `Scenario` headings
- **THEN** `generate-tasks.ts` exits non-zero
- **AND** `tasks.md` is not written
