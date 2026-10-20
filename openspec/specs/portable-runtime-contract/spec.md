# portable-runtime-contract

## Purpose

Defines how the delivery core discovers and invokes host capabilities without depending on a named LLM, agent product, forge, or tracker.

## Requirements

### Requirement: Runtime capabilities use a vendor-neutral manifest
The delivery core SHALL read a versioned runtime manifest whose capability identifiers and invocation descriptors contain no vendor-specific assumptions.

#### Scenario: Capable host starts a stage
- **WHEN** a host manifest advertises every capability required by a stage
- **THEN** delivery invokes those capabilities through their declared descriptors

#### Scenario: Capability is absent
- **WHEN** a stage requires a capability the manifest does not advertise
- **THEN** delivery stops with the missing capability and a configuration-oriented remedy

### Requirement: Core behavior does not branch on host identity
The delivery core MUST select behavior from advertised capabilities rather than a host or model vendor name.

#### Scenario: Two hosts advertise equivalent capabilities
- **WHEN** two differently implemented hosts provide equivalent manifests
- **THEN** delivery selects the same lifecycle behavior on both

### Requirement: Mutation enforcement fails closed
A mutating stage SHALL run only when the runtime manifest declares an enforceable mutation boundary and its preflight succeeds.

#### Scenario: Host cannot enforce mutation policy
- **WHEN** a mutating stage starts on a runtime without an enforceable guard
- **THEN** delivery refuses the mutation while read-only stages remain available

### Requirement: Model dispatch uses advertised identifiers
Delivery SHALL route by required capability and resolve only model identifiers advertised by the current runtime.

#### Scenario: Required model tier is unavailable
- **WHEN** no advertised model satisfies the task's required capability tier
- **THEN** delivery stops rather than lowering the tier or inventing an identifier

### Requirement: Integrations are providers
Forge, tracker, review, subprocess, and subagent operations SHALL be addressed by provider capabilities, not hard-coded product commands.

#### Scenario: Provider returns a normalized result
- **WHEN** an adapter invokes its native integration
- **THEN** it returns the normalized core result for that capability

### Requirement: Session tools may satisfy provider operations
When the host exposes integration tools, delivery SHALL record them, map them onto the portable forge and work-item operations, prefer a mapped tool over a CLI adapter, and schema-validate the result. It SHALL NOT call an unmapped tool or a tool that merges, closes, approves, deletes, resolves discussions, or transitions work-item status.

#### Scenario: Authenticated session tools cover a tracker
- **WHEN** the recorded inventory maps list, read, create, link, and note onto host tools
- **THEN** doctor offers that tracker as a work-item provider without requiring the CLI adapter

#### Scenario: Session tool output is product-shaped
- **WHEN** a mapped host tool returns native JSON rather than the portable schema
- **THEN** delivery normalizes and validates it before use, and refuses malformed evidence
