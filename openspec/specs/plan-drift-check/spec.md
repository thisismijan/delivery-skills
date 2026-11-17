# plan-drift-check Specification

## Purpose
Compare what a build changed with what its change planned, before the holdout review, so a file changed outside the plan or an oversized low-complexity build is reported to the reviewer and in the change description instead of relying on someone noticing.

## Requirements

### Requirement: The build is compared with its plan before the holdout review
`/execute` SHALL compare the files the build changed with the paths the
proposal's Impact section names and the feasibility `affectedAreas` recorded in
the change metadata, before the holdout review. Test files SHALL count as
planned. Each unplanned file SHALL be reported to the holdout reviewer and named
in the change description under what the checks do not prove. Drift SHALL NOT
stop the run by itself; unreadable evidence SHALL.

#### Scenario: A file the plan does not name
- **WHEN** the build changes a file outside every planned path
- **THEN** the drift report names it, the holdout reviewer receives it, and the change description lists it

#### Scenario: A build inside its plan
- **WHEN** every changed file is planned or a test and the size is within limits
- **THEN** the drift report shows no drift

### Requirement: A low-complexity build that outgrows the contained limits is flagged
The drift check SHALL report a size overrun when a change rated low complexity
changes more files or lines than the contained-diff limits.

#### Scenario: An oversized low-complexity change
- **WHEN** a low-complexity change exceeds the contained line limit
- **THEN** the drift report flags a size overrun
