## ADDED Requirements

### Requirement: The failure classifier is measured on held-out jobs
The CI failure classifier SHALL be tested against labelled real jobs it was
never changed against, as well as the sets it was fixed against. No labelled
job that is not infrastructure SHALL be classified as infrastructure. A miss on
the held-out set SHALL be recorded and kept, not fixed in place.

#### Scenario: A job id followed by "failed"
- **WHEN** a build log says an image tagged with a job id "failed"
- **THEN** that line is not read as a test runner's failure count

#### Scenario: A recorded held-out miss
- **WHEN** the classifier is changed so that a recorded held-out miss now matches
- **THEN** the held-out test fails and asks for freshly labelled jobs before that kind is counted as handled
