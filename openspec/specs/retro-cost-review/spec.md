# retro-cost-review Specification

## Purpose
Shows in each retro where a run's tokens went, measured or by labelled cost drivers, and which savings are worth considering without weakening any gate.

## Requirements

### Requirement: The retro shows where the tokens went

The retro SHALL run the cost review for every key in the ledger and present
measured tokens and cost, ranked by kind of work, when the run recorded them.
When it did not, the retro SHALL say so and present the cost drivers as
proxies. It SHALL never estimate a token figure.

#### Scenario: A measured run

- **GIVEN** a run whose execute and review tasks recorded token counts
- **WHEN** the retro reviews token cost
- **THEN** it shows the totals and the kinds of work that used the most, with each one's share

#### Scenario: An unmeasured run

- **GIVEN** a run with no recorded token counts
- **WHEN** the retro reviews token cost
- **THEN** it says the run was not measured and shows review rounds, repairs, and packet sizes as proxies

### Requirement: Savings never cost quality

Each saving the retro proposes SHALL carry its evidence and the same proof as
any proposal. A saving SHALL NOT remove or weaken a gate, a review, a holdout,
or a quality check, and a cheaper model SHALL need a paired benchmark first.

#### Scenario: Many review rounds

- **GIVEN** a ticket that took three review rounds
- **WHEN** the cost review runs
- **THEN** it lists the rounds as a saving to consider, pointing at why findings kept arriving rather than at dropping a review
