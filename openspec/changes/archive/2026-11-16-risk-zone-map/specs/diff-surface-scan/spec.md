## ADDED Requirements

### Requirement: Owner-drawn red zones force a full review

When the main checkout holds `.delivery/zones`, `diff-scan.ts` SHALL report the
changed paths in each red and yellow zone, and a change with red-zone paths
SHALL run every review lens at any level. Yellow zones SHALL only be reported.
With no map, the scan output and the fan-out SHALL be unchanged. An unreadable
map SHALL stop the scan.

#### Scenario: A diff touching a red zone is reviewed by every lens

- **GIVEN** a map marking `src/billing` red
- **WHEN** a diff touching `src/billing/rules.ts` is scanned and fanned out
- **THEN** every review lens runs

#### Scenario: No zone map

- **GIVEN** no `.delivery/zones`
- **WHEN** a diff is scanned
- **THEN** the scan output has no zones

#### Scenario: An unreadable map

- **GIVEN** a map with a line that is not `red <path>` or `yellow <path>`
- **WHEN** the scan runs
- **THEN** it exits 1 naming the line

### Requirement: Building in a red zone needs a person's approval

Before `/execute` builds a change whose planned paths reach a red zone, or
name no path while a red zone exists, it SHALL stop until an Approvals line in
a person's words names `red-zone <changeName>`. Plan approval and
`continuous-delivery: yes` SHALL NOT satisfy it. With no map, it SHALL not ask.

#### Scenario: A planned red-zone change waits

- **GIVEN** a map marking `src/billing` red and a change planning `src/billing/rules.ts`
- **WHEN** the change is checked before execute
- **THEN** it exits 3 until the ledger holds the approval line

#### Scenario: No map, no question

- **GIVEN** no `.delivery/zones`
- **WHEN** a change is checked before execute
- **THEN** it exits 0
