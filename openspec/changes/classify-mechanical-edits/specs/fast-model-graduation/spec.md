## ADDED Requirements

### Requirement: Classified mechanical edits may be fast-eligible

A task whose work type is mechanical-edit SHALL be fast-eligible when it is reversible, local, a known pattern, strongly verified, and not blocked by a named safety floor. Search, classify, and summarise remain fast-eligible under the existing rules. Ordinary implement and write-tests SHALL still sit at least at the standard floor. Classifying a mechanical-edit SHALL NOT mark a fast catalogue model live.

#### Scenario: A classified mechanical-edit can be fast-eligible
- **WHEN** a task is a mechanical-edit, reversible, local, known-pattern, and strongly verified, with no named safety domain
- **THEN** fast eligibility holds for shadow routing and later graduation scoring

#### Scenario: Ordinary implement stays off the fast floor
- **WHEN** a task is implement or write-tests
- **THEN** the routing floor remains at least standard

#### Scenario: Auth mechanical-edit is still blocked
- **WHEN** a mechanical-edit task includes the auth domain
- **THEN** fast dispatch is refused and the reason names the auth floor

#### Scenario: Classifying mechanical-edit does not promote Haiku
- **WHEN** mechanical-edit units exist and Haiku has no exact operator promotion approval
- **THEN** Haiku remains evaluation-only
