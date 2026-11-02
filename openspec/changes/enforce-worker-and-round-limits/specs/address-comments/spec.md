## ADDED Requirements

### Requirement: A review round past the cap needs a recorded approval
`review-rounds.ts record` SHALL refuse, with exit 1 and no write, a round
numbered past the level's `maxReviewRounds` unless `review-rounds.ts allow`
recorded the operator's approval for that exact round.

#### Scenario: Fourth round at the standard level
- **WHEN** three rounds are recorded and a fourth is recorded with no approval
- **THEN** it is refused and the rounds file is unchanged

#### Scenario: Approved extra round
- **WHEN** the operator's approval for round four is recorded
- **THEN** the fourth round is recorded, and a fifth is refused again
