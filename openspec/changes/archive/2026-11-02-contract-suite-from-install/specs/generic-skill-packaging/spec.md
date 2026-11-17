## ADDED Requirements

### Requirement: The delivery contract suite runs from an installed skill
The delivery contract suite SHALL pass from a fresh `install.sh` into a skills
directory. Tests SHALL read factory scripts from `factory/` in a checkout or
`_factory/` in an install. A test group that needs a file only a checkout has
SHALL be skipped from an install, with the reason in the skipped test's name.

#### Scenario: Fresh install
- **WHEN** the suite runs inside a fresh install
- **THEN** it reports zero failures and zero errors

#### Scenario: Checkout-only group
- **WHEN** a group needs `README.md`, `factory/`, or `adapters/` and runs from an install
- **THEN** it is skipped and its name says it needs a delivery-skills checkout
