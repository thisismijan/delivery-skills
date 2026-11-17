# Spec Delta

## Purpose

Ensures a person choosing among delivery alternatives receives clear evidence, trade-offs, technical context, and a justified recommendation before deciding.

## ADDED Requirements

### Requirement: Multi-option decisions receive a complete brief
Before asking a human to choose among two or more viable options, the delivery system SHALL present the decision, why it is needed now, the known constraints and unknowns, and a precise final question naming the choices.

#### Scenario: Product choice has multiple viable options
- **WHEN** a delivery workflow needs a human to select one of two viable product behaviors
- **THEN** it presents the decision context and both choices before asking one precise question

#### Scenario: Factual input is missing
- **WHEN** a workflow needs a fact such as an identifier, credential location, or intended repository rather than a choice among alternatives
- **THEN** it may ask directly without manufacturing a multi-option decision brief

### Requirement: Each option explains reasoning and consequences
For every viable option, the decision brief SHALL explain how it works, why it is being considered, its benefits, drawbacks, risks, and practical consequence for the current delivery.

#### Scenario: Alternatives have different trade-offs
- **WHEN** two implementation options differ in delivery cost, risk, or behavior
- **THEN** each option explains those differences in plain language rather than presenting labels alone

### Requirement: DSA implications are assessed
The decision brief SHALL include a DSA lens that explains material data-structure, algorithmic-complexity, or concurrency differences. It SHALL quantify complexity only when supported; otherwise it SHALL state that DSA does not materially distinguish the options.

#### Scenario: Algorithmic behavior differs
- **WHEN** one option changes lookup, traversal, scheduling, ordering, memory, or concurrency behavior
- **THEN** the brief explains the relevant time, space, or correctness trade-off and its practical consequence

#### Scenario: DSA is not a discriminator
- **WHEN** the options have no material data-structure or algorithmic difference
- **THEN** the brief says so explicitly and does not invent Big-O claims

### Requirement: System-design implications are assessed
The decision brief SHALL include a system-design lens that explains material differences in boundaries, state ownership, consistency, scaling, reliability, security, or operability. When none are material, it SHALL state that system design does not distinguish the options.

#### Scenario: Architecture differs
- **WHEN** alternatives place state or responsibility in different components
- **THEN** the brief explains the effects on coupling, failure modes, recovery, scaling, and operations that matter to the decision

#### Scenario: Architecture is unchanged
- **WHEN** alternatives use the same boundaries and operational model
- **THEN** the brief states that there is no material system-design difference and identifies the actual discriminator

### Requirement: Recommendation remains evidence-bound
The decision brief SHALL recommend one option, explain why it best fits current evidence, identify its assumptions, state what evidence would change the recommendation, and describe reversibility and the consequence of delaying or giving no answer.

#### Scenario: One option best fits current evidence
- **WHEN** the available evidence favors one viable option
- **THEN** the system recommends it with assumptions and change triggers while leaving the final decision to the human

#### Scenario: Evidence does not support a preference
- **WHEN** the options remain materially balanced after analysis
- **THEN** the system says the recommendation is weak, identifies the deciding value judgment or missing evidence, and still asks the human to choose

### Requirement: Depth follows decision consequence
The decision brief SHALL keep routine reversible choices concise and SHALL provide deeper analysis for costly, difficult-to-reverse, cross-system, safety-critical, or operationally significant choices.

#### Scenario: Choice is local and reversible
- **WHEN** either option can be changed cheaply without external impact
- **THEN** the brief covers every required field concisely

#### Scenario: Choice is difficult to reverse
- **WHEN** the decision changes a public contract, persistent data, security boundary, distributed state, or operational topology
- **THEN** the brief expands the relevant technical lenses, failure modes, migration implications, and rollback considerations
