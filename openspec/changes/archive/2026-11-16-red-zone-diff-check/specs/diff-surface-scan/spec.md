## ADDED Requirements

### Requirement: The build's diff is held to the red-zone approval

After the green gate, `/execute` SHALL check the build's diff against the zone
map. It SHALL stop before the holdout review when the diff touches a red zone
and no person approved `red-zone <changeName>`. Spec and delivery files SHALL
not count.

#### Scenario: A build strays into an unplanned red zone

- **GIVEN** a change planned for `src/ui/button.ts` and a map marking `src/billing` red
- **WHEN** the build also changes `src/billing/rules.ts`
- **THEN** execute stops before the holdout review until the approval line exists

### Requirement: Doctor checks the zone map

When `.delivery/zones` exists, `/delivery doctor` SHALL report the number of
red and yellow zones, or a setup item naming the line it cannot read. Without
a map it SHALL add no check.

#### Scenario: An unreadable map

- **GIVEN** a map with an unknown zone kind on line 1
- **WHEN** doctor runs
- **THEN** it reports a setup item naming line 1
