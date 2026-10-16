# Spec Delta

## Purpose

Defines how the delivery core discovers and invokes host capabilities without depending on a named LLM, agent product, forge, or tracker.

## ADDED Requirements

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
