## ADDED Requirements

### Requirement: The conductor loads verb-specific detail on demand

The delivery conductor SHALL keep setup, the human decision brief, the command
cheat-sheet, and its own ledger writes in bundled files, and SHALL name for
each when to read it. Moving them SHALL NOT change any rule, and the conductor
SHALL stay within its lowered size ceiling.

#### Scenario: Help

- **GIVEN** `/delivery help`
- **WHEN** the conductor answers
- **THEN** it shows the cheat-sheet from `reference/help.md`

#### Scenario: An escalated choice

- **GIVEN** a choice the operator must make
- **WHEN** the conductor escalates it
- **THEN** it follows `reference/decision-brief.md`, giving options and trade-offs before any recommendation
