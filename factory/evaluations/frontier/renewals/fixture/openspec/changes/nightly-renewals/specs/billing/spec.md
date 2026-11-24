## ADDED Requirements

### Requirement: Subscriptions renew nightly

Every active subscription that is due SHALL be charged by the nightly job, and
its next renewal SHALL fall on the same day of the month, or on the month's
last day when that month is shorter.

#### Scenario: An ordinary renewal

- **GIVEN** a subscription that renews on 12 March
- **WHEN** the nightly job runs on 12 March and the charge succeeds
- **THEN** the customer is charged once and the next renewal is 12 April

#### Scenario: A renewal at the end of a month

- **GIVEN** a subscription that renews on 31 January
- **WHEN** it renews
- **THEN** the next renewal is 28 February, or 29 February in a leap year

### Requirement: Declined cards are retried

A declined renewal SHALL be attempted on the card again each night, and the
subscription SHALL be cancelled after seven declined nights.

#### Scenario: A card declined once

- **GIVEN** a renewal charge was declined last night
- **WHEN** the nightly job runs
- **THEN** the card is charged again

### Requirement: Authentication is waited for

A renewal the customer's bank wants authenticated SHALL renew only once the
customer authenticates.

#### Scenario: The bank asks for authentication

- **WHEN** the gateway answers a renewal charge with `requires_action`
- **THEN** the customer is emailed an authentication link
- **AND** the subscription is not renewed until the charge succeeds

### Requirement: Paused time is not charged

A resumed subscription SHALL NOT be charged for the months it was paused.

#### Scenario: Resumed after three months

- **GIVEN** a subscription paused on 3 February and resumed on 10 May
- **WHEN** the nightly job runs on 11 May
- **THEN** the customer has not been charged for February, March, or April
