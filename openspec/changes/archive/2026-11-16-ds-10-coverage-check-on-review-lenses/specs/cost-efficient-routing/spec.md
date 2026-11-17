## ADDED Requirements

### Requirement: Focused coverage passes use the standard tier and add no skipped-worker entry
Every focused coverage pass of the max correctness review SHALL use the exact resolved standard-tier model, and the standard-tier model identity SHALL be recorded for that worker as it is for a review lens. The main conversation SHALL adjudicate every candidate a focused pass returns against the pinned code before it affects the verdict. A review with no lens, whose lens fan-out is already recorded as a skipped `review-lens` worker, SHALL record the coverage skip only in the coverage artifact and SHALL NOT add a second skipped-worker entry for it.

#### Scenario: A focused pass uses the standard tier
- **WHEN** a focused coverage pass is dispatched for an unexamined file
- **THEN** it runs on the exact model identifier that resolving `standard` returned
- **AND** the main conversation verifies any candidate it returns against pinned evidence

#### Scenario: A skipped review adds no second skipped-worker entry
- **WHEN** no review-lens subagent is dispatched and the coverage check records its skip
- **THEN** `skipped-workers.json` still names only the `review-lens` worker
- **AND** the scorecard counts no extra avoided worker for the coverage check
