# generic-skill-packaging

## Purpose

Defines a host-independent installation surface for the skill pack while keeping product-specific setup in optional adapters.

## Requirements

### Requirement: Generic installation targets an explicit directory
The installer SHALL support installing the skills and runtime into an operator-supplied destination without inferring a named host.

#### Scenario: Explicit destination is writable
- **WHEN** the operator supplies a writable skills directory
- **THEN** the installer places the generic skills and runtime there and reports the resulting paths

#### Scenario: Destination is not writable
- **WHEN** the supplied destination cannot be written
- **THEN** the installer fails without partially replacing an existing installation

### Requirement: Host adapters are optional
Host-specific paths, hooks, commands, and configuration SHALL live outside the generic core and SHALL be selected explicitly.

#### Scenario: Generic install omits adapters
- **WHEN** the operator installs only the generic pack
- **THEN** no host-specific configuration or product name is required

#### Scenario: Adapter is selected
- **WHEN** the operator selects an available adapter
- **THEN** that adapter may add native setup without changing generic core files

### Requirement: Generic files stay vendor neutral
Human-facing generic files under the core packaging boundary MUST NOT name an LLM vendor, agent host, forge, or tracker product.

#### Scenario: Portability contract test scans core files
- **WHEN** the repository test suite scans the generic packaging boundary
- **THEN** it fails on a forbidden product name

### Requirement: Installation preserves user state
Reinstalling the pack MUST preserve target-repository run state and MUST replace only files recorded as managed by the installer.

#### Scenario: Existing state and unmanaged files are present
- **WHEN** the generic installer updates a destination
- **THEN** it preserves unmanaged files and all target-repository delivery state

### Requirement: Concurrent installs do not race dependency preparation
The installer SHALL serialize preparation and copying of the shared Bun dependency tree while allowing each destination to activate independently.

#### Scenario: Two hosts install from one checkout
- **WHEN** two installer processes start against different skills directories at the same time
- **THEN** both complete without package-link collisions or partial destinations

### Requirement: The delivery contract suite runs from an installed skill
The delivery contract suite SHALL pass from a fresh `install.sh` into a skills
directory. Tests SHALL read factory scripts from `factory/` in a checkout or
`_factory/` in an install. A test group that needs a file only a checkout has
SHALL be skipped from an install, with the reason in the skipped test's name.

#### Scenario: Fresh install
- **WHEN** the suite runs inside a fresh install
- **THEN** it reports zero failures and zero errors

#### Scenario: Checkout-only group
- **WHEN** a group needs `README.md`, `factory/`, or `adapters/` and runs from an install
- **THEN** it is skipped and its name says it needs a delivery-skills checkout

### Requirement: Every skill file has a size ceiling
Each `SKILL.md` in the pack SHALL have a recorded size ceiling. The pack's tests
SHALL fail, naming the skill, when a skill exceeds its ceiling or has none.
Raising a ceiling SHALL be an explicit change to the recorded ceilings.

#### Scenario: A skill grows past its ceiling
- **WHEN** a `SKILL.md` is larger than its recorded ceiling
- **THEN** the tests fail and name that skill

#### Scenario: A deliberate raise
- **WHEN** a change raises one skill's ceiling with the raise command
- **THEN** the recorded ceilings change in that same change and the tests pass

### Requirement: The Cursor plugin runs judging agents read-only

The Cursor plugin install SHALL carry the pack's skills, runtime, and one agent
per factory agent. It SHALL declare `readonly: true` for every agent whose
declared tools cannot write files or run commands. The runtime SHALL dispatch
a host-provided subagent by the named agent's exact name. The existing install
SHALL keep working.

#### Scenario: The holdout reviewer under the plugin

- **GIVEN** the plugin installed
- **WHEN** a skill dispatches the holdout reviewer
- **THEN** Cursor runs the plugin's `holdout-reviewer` agent, which is declared read-only

#### Scenario: Writing agents stay writable

- **GIVEN** the plugin installed
- **WHEN** the test writer or implementer is dispatched
- **THEN** its agent is not declared read-only

#### Scenario: The plain install

- **GIVEN** the existing Cursor install
- **WHEN** it runs
- **THEN** it installs the same skills and runtime as before

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

### Requirement: Claude Code runs the factory agents natively

The Claude Code adapter SHALL install every factory agent as a native subagent
that keeps its declared tools. It SHALL replace only agents it installed and
SHALL NOT replace an agent of the same name that it did not install.

#### Scenario: The holdout reviewer under Claude Code

- **GIVEN** the Claude Code adapter installed
- **WHEN** a skill dispatches the holdout reviewer
- **THEN** the host runs the native `holdout-reviewer` agent with tools Read, Grep, and Glob only

#### Scenario: An unmanaged agent

- **GIVEN** an agent the pack did not install, with another name
- **WHEN** the adapter reinstalls
- **THEN** that agent is unchanged
