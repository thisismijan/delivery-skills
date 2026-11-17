## ADDED Requirements

### Requirement: Yellow-zone files get a characterization pass

When the main checkout holds `.delivery/zones`, the characterization check
SHALL list each referenced planned file in a yellow zone as pinned with the
reason `yellow zone`, and SHALL exit 3. `/execute` SHALL pin it before the
change's tests. Without a map, the check SHALL be unchanged.

#### Scenario: A referenced file in a yellow zone

- **GIVEN** a planned file in a yellow zone that a test references
- **WHEN** the check runs
- **THEN** the file is listed with the reason `yellow zone` and the command exits 3

#### Scenario: No zone map

- **GIVEN** no zone map
- **WHEN** the check runs
- **THEN** the result is unchanged
