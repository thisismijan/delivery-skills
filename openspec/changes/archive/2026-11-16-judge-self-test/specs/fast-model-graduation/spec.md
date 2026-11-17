## ADDED Requirements

### Requirement: A judge's scores count only after it passes a self-test
When a model judged an output to produce a utility score, the score SHALL carry
the judge's self-test: its scores for a known-good and a known-bad reference on
the same task. A judge that ties or ranks the known-bad reference higher SHALL
have its scores refused, in improve's paired evaluation and in model graduation.
Both arms of a paired evaluation SHALL be scored the same way.

#### Scenario: A judge that ranks bad above good
- **WHEN** an evaluation's judge scored the known-bad reference higher than the known-good one
- **THEN** its scores are refused and the evaluation says why

#### Scenario: Scores from deterministic checks
- **WHEN** utility came from deterministic checks
- **THEN** no self-test is needed and the scores count as before
