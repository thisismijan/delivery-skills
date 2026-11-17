# Spec Delta

## Purpose

Defines a host-independent installation surface for the skill pack while keeping product-specific setup in optional adapters.

## ADDED Requirements

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
Human-facing generic files under the core packaging boundary MUST NOT name a source framework, LLM vendor, agent host, forge, or tracker product.

#### Scenario: Portability contract test scans core files
- **WHEN** the repository test suite scans the generic packaging boundary
- **THEN** it fails on a forbidden product or source-framework name

### Requirement: Installation preserves user state
Reinstalling the pack MUST preserve target-repository run state and MUST replace only files recorded as managed by the installer.

#### Scenario: Existing state and unmanaged files are present
- **WHEN** the generic installer updates a destination
- **THEN** it preserves unmanaged files and all target-repository delivery state
