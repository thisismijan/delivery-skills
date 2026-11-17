## ADDED Requirements

### Requirement: Every skill file has a size ceiling
Each `SKILL.md` in the pack SHALL have a recorded size ceiling. The pack's tests
SHALL fail, naming the skill, when a skill exceeds its ceiling or has none.
Raising a ceiling SHALL be an explicit change to the recorded ceilings.

#### Scenario: A skill grows past its ceiling
- **WHEN** a `SKILL.md` is larger than its recorded ceiling
- **THEN** the tests fail and name that skill

#### Scenario: A deliberate raise
- **WHEN** a change raises one skill's ceiling with the raise command
- **THEN** the recorded ceilings change in that same change and the tests pass
