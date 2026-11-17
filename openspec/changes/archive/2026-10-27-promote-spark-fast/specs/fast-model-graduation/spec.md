## ADDED Requirements

### Requirement: An approved fast candidate may be live while others stay evaluation-only

When representative-run evidence for an exact fast catalogue candidate has cleared the sample size, 90 percent bar, and zero-miss rule, and an operator promotion approval names that candidate, that candidate's catalogue availability MAY be live. Other fast candidates SHALL remain evaluation-only until they receive their own exact approval.

#### Scenario: Spark may be live after exact approval
- **WHEN** the catalogue is loaded after an operator promotion approval naming `muse-spark-1.3-medium`
- **THEN** that candidate is live and `composer-1` and `haiku` remain evaluation-only

#### Scenario: Unapproved fast ids still need evaluation resolve
- **WHEN** live fast resolve is asked with only `composer-1` advertised
- **THEN** resolve fails closed because matching models are evaluation-only
