## ADDED Requirements

### Requirement: Execute loads rarely used detail on demand

`/execute` SHALL read the routing-profiling procedure only when
`routingProfiling` is exactly `always`, and SHALL keep the mechanical-edit unit
list and the fast-model promotion rules in reference files it names. It SHALL
still never dispatch a catalogue fast model that is not live. No gate SHALL
change.

#### Scenario: Profiling off

- **GIVEN** `routingProfiling` is `off`
- **WHEN** execute dispatches the implementer and the holdout reviewer
- **THEN** it does not read `factory/reference/routing-profiling.md`

#### Scenario: Profiling always

- **GIVEN** `routingProfiling` is `always`
- **WHEN** execute reaches the implementer
- **THEN** it follows the Implementation section of `factory/reference/routing-profiling.md`
