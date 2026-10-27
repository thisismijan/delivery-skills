## ADDED Requirements

### Requirement: Live resolve may match an advertised alias of an approved candidate

A live fast catalogue candidate MAY list advertised aliases. Resolve SHALL return the inventory identifier the host advertised when it matches the candidate id or one of its aliases. An evaluation-only candidate SHALL stay blocked on live resolve even when an alias is advertised. An id the host does not advertise SHALL NOT be invented.

#### Scenario: Haiku resolves to the advertised host id
- **WHEN** live fast resolve is asked with inventory `claude-haiku-5-5-medium`
- **THEN** it returns that advertised id for the live `haiku` candidate

#### Scenario: Composer stays blocked
- **WHEN** live fast resolve is asked with only ids this host advertises and without `composer-1`
- **THEN** Composer is not selected and remains evaluation-only
