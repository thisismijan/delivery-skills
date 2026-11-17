# seamless-onboarding

## Purpose

Makes delivery-pack installation and first use predictable, diagnosable, and minimally configured without weakening host or human safety boundaries.

## Requirements

### Requirement: Every install has one runtime manifest
The installer SHALL write a valid complete manifest at `_factory/runtime-manifest.json`. Generic installation SHALL default unavailable capabilities to fail-closed descriptors and SHALL require no hand-authored manifest.

#### Scenario: Generic installation
- **WHEN** the pack is installed without an adapter or provider
- **THEN** the canonical manifest exists, parses successfully, and does not authorize mutation

#### Scenario: Bun is missing
- **WHEN** install runs without Bun on PATH
- **THEN** it stops before copying files and prints the exact install command for the pinned version

#### Scenario: Reinstallation
- **WHEN** an existing managed installation is upgraded
- **THEN** the canonical manifest is rebuilt from selected configuration without deleting unmanaged files or run state

### Requirement: Adapter and provider capabilities compose safely
Selected adapters and providers SHALL overlay only their owned capabilities into the canonical manifest. A component SHALL NOT mark a capability available unless its setup and non-destructive readiness probe succeed.

#### Scenario: Forge provider is ready
- **WHEN** GitLab tools, supporting executables, and credential presence pass their probes
- **THEN** forge and review capability descriptors reference the installed wrappers

#### Scenario: Provider setup is incomplete
- **WHEN** a required provider tool or credential is missing
- **THEN** installation remains safe, the capability stays unavailable, and output names the remedy without exposing secrets

### Requirement: Mutation enforcement is observed
A mutation capability SHALL be marked enforced only after host-specific setup verifies an executable denial boundary. Static adapter declaration alone SHALL NOT authorize a mutating stage.

#### Scenario: Claude hook installs successfully
- **WHEN** the installer additively persists and verifies the checked-in PreToolUse hook
- **THEN** the manifest marks mutation enforcement active without replacing unrelated settings

#### Scenario: Cursor hook installs successfully
- **WHEN** the installer additively persists and verifies user-level `hooks.json`
- **THEN** the manifest marks mutation enforcement active without replacing unrelated hooks

#### Scenario: Cursor adapter is installed without verification
- **WHEN** Cursor setup has not verified a denial hook
- **THEN** read-only capabilities remain usable and mutating stages remain blocked

### Requirement: Doctor reconciles live readiness
The system SHALL provide a doctor command that non-destructively checks installation, target-repository, adapter, provider, and mutation-boundary readiness and groups results as Ready now, Needs setup, Host limitation, or Human-owned. It SHALL distinguish read-only lifecycle from full lifecycle.

#### Scenario: Partially configured host
- **WHEN** required read-only checks pass but optional tracker or spec tooling is absent
- **THEN** doctor reports read-only lifecycle available and exact setup remedies without declaring the whole pack unusable

#### Scenario: Unpinned runtime
- **WHEN** Bun is present but does not match the pinned `packageManager` version
- **THEN** doctor lists the exact install command as a setup item and still reports read-only lifecycle available

#### Scenario: Secret-backed provider
- **WHEN** doctor checks provider authentication
- **THEN** it reports only credential presence or absence and never prints a secret value

### Requirement: Stage gating uses the canonical path
Every mutating stage SHALL read the installed runtime manifest from `$FACTORY_ROOT/runtime-manifest.json` and SHALL fail closed when it is missing, malformed, unavailable, or unenforced.

#### Scenario: Mutation guard is not enforced
- **WHEN** a mutating stage starts with an unavailable or unenforced mutation descriptor
- **THEN** stage gating rejects the stage and prints the configuration remedy

### Requirement: Target bootstrap is idempotent
The system SHALL provide an explicit target-repository bootstrap that adds delivery state paths to `.gitignore` once, verifies local writability, reprints unresolved doctor checks, and prints valid first commands without creating remote resources.

#### Scenario: Bootstrap runs twice
- **WHEN** target bootstrap is invoked repeatedly
- **THEN** `.delivery/` and `.review/` each appear once and existing repository content is preserved

#### Scenario: Directory is not a target repository
- **WHEN** bootstrap runs outside a writable git repository
- **THEN** it stops without writing files and explains the required target context

### Requirement: Post-install handoff is actionable
After installation, output SHALL name installed paths, unavoidable host reload, doctor invocation, and adapter-specific remaining actions. It SHALL distinguish setup work from human-owned delivery decisions.

#### Scenario: Successful host-specific install
- **WHEN** an adapter installation completes
- **THEN** the operator receives the exact reload and doctor steps and any unresolved capability remedies
