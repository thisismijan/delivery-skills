## ADDED Requirements

### Requirement: The operator can walk through a change before merging it

`/delivery walkthrough <iid>` SHALL ask the operator between three and five
questions about the change at its pinned head, one per message, each grounded
in a file it cites. It SHALL NOT give an answer before the operator answers,
except when they ask to be told. A wrong or vague answer SHALL get a narrower
question, and after two of those an explanation and one re-ask from another
angle.

#### Scenario: Wrong answer

- **WHEN** the operator answers a question wrongly
- **THEN** the next message asks a narrower question that exposes the contradiction, and gives no answer

### Requirement: A walkthrough is recorded and never a gate

The walkthrough SHALL record each question's topic, cited file, kind, outcome,
and hints under `.review/mr-<ref>/<head>/walkthrough.json`, and SHALL write
nothing else. Release readiness SHALL show that record's summary for the same
head, or suggest the walkthrough when none exists, and SHALL NOT change GO or
NO-GO because of it.

#### Scenario: Nothing explained

- **GIVEN** a walkthrough where the operator explained no question
- **WHEN** release readiness writes its brief
- **THEN** it lists those topics as worth reading before merging and keeps the verdict it reached without them
