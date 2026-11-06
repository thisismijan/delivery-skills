## ADDED Requirements

### Requirement: A change description says what was decided and what is unproven
A change description written by `/execute` SHALL contain one "Decisions made
for you" section and one "What the checks do not prove" section, each with
content. Decisions MAY be `None.` when the spec made every choice. The
unproven section SHALL NOT be empty or say none. `/execute` SHALL NOT open the
change until `change-description.ts check` passes.

#### Scenario: A description that only says the work went well
- **WHEN** the description has neither section
- **THEN** the check fails, names both missing sections, and no change is opened

#### Scenario: A claim that the checks prove everything
- **WHEN** the unproven section says none
- **THEN** the check fails and asks what the tests fake, what no test runs, or what was tested only against its own data

### Requirement: Workers report the decisions they made
The implementer and test-writer handoffs SHALL carry a **Decisions** heading
listing each choice the approved spec did not make, with why, or `none`.

#### Scenario: A default the spec left open
- **WHEN** the implementer picks a default value the spec does not state
- **THEN** its handoff lists that choice under Decisions and the change description carries it
