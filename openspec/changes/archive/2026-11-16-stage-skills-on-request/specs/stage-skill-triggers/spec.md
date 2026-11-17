## ADDED Requirements

### Requirement: Cursor plugin stage skills start only on request

The Cursor plugin SHALL mark `/groom`, `/draft`, `/execute`,
`/address-comments`, `/mr-review`, and `/openspec-archive` so the model cannot
start them on its own, and SHALL leave `/delivery` and `/code-review-max`
model-invocable. The `/delivery` conductor SHALL still start each stage, from
its sibling `SKILL.md` when the host does not offer the command.

#### Scenario: A plain question

- **GIVEN** the plugin installed
- **WHEN** a plain question arrives
- **THEN** no stage skill starts on the model's judgement

#### Scenario: Auto reaches the draft stage

- **GIVEN** `/delivery auto` running under the plugin
- **WHEN** it reaches the draft stage
- **THEN** the conductor starts `/draft` from `../draft/SKILL.md` with the same arguments
