## ADDED Requirements

### Requirement: Feasibility starts from groom's explorer report
`/groom` SHALL record the repository head under each explorer session it
saves. Before dispatching the feasibility analyst, `/draft` SHALL find the one
grooming report whose ticket draft has the work item's exact title and pass it
with whether it is stale and which files changed since its head. The analyst
SHALL re-explore those files. The explain-back reader and the readiness reviewer
SHALL NOT receive the report.

#### Scenario: A fresh report
- **WHEN** a matching report was written at the current head
- **THEN** feasibility receives it as a fresh starting map

#### Scenario: The repository changed since
- **WHEN** files changed after the report's recorded head
- **THEN** the report is marked stale, the changed files are listed, and the analyst re-explores them

#### Scenario: No single match
- **WHEN** no grooming draft, or more than one, has the work item's title
- **THEN** no report is used and feasibility explores from scratch
