# held-out-evidence Specification

## Purpose
Measure any rule written from sample data on real samples it was not written from, labelled before the code ran on them, so a passing test on the rule's own samples is never taken as proof that it holds.

## Requirements

### Requirement: Rules written from samples are measured on held-out samples
When an acceptance criterion is met by a rule written from sample data, `/draft`
SHALL set aside real samples the rule is not written from, labelled from their
source before any code runs, under `.review/<changeName>/held-out-samples/`.
`/execute` SHALL run the rule over them after the green gate and pass the result
to the holdout review. A held-out miss SHALL be recorded and named in the
change description, never sent to the implementer to fix.

#### Scenario: A rule that misses a held-out sample
- **WHEN** the rule classifies a held-out sample differently from its label
- **THEN** the held-out test file keeps it as a recorded miss and the change description names it

#### Scenario: Nothing set aside
- **WHEN** no samples could be set aside
- **THEN** `design.md` says so and the change description names the rule under what the checks do not prove

### Requirement: The holdout review refuses a rule tested only on its own samples
The holdout reviewer SHALL NOT count a rule written from samples as
meaningfully tested when its only tests use those samples, unless the evidence
includes a held-out result or `design.md` says none could be set aside. The
implementer SHALL NOT read the held-out samples.

#### Scenario: Tests from the design samples only
- **WHEN** a pattern list is tested only against the samples it was written from and no held-out result exists
- **THEN** the review requests changes
