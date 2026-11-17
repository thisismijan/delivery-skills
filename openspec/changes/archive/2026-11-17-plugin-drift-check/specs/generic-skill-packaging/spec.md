## ADDED Requirements

### Requirement: Doctor reports a stale Cursor plugin

When the factory runs from a Cursor plugin install, `/delivery doctor` SHALL
compare the plugin's agents and stage-skill markings with what the plugin build
writes from that factory. It SHALL report a setup item naming each difference
and the reinstall command. A plain install SHALL get no plugin check.

#### Scenario: A judge left writable

- **GIVEN** a plugin whose holdout-reviewer agent lacks `readonly: true`
- **WHEN** doctor runs
- **THEN** it reports a setup item naming that agent and `adapters/cursor/install-plugin.sh`

#### Scenario: A matching plugin

- **GIVEN** a plugin built from the installed factory
- **WHEN** doctor runs
- **THEN** the plugin check is ready

#### Scenario: A plain install

- **GIVEN** a plain install
- **WHEN** doctor runs
- **THEN** no plugin check appears
