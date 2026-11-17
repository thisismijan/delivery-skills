## ADDED Requirements

### Requirement: Explorer and feasibility read past decisions before code
The groom explorer and the feasibility analyst SHALL read the OpenSpec specs and
archived changes relevant to a ticket before reading code. The explorer's report
SHALL cite each one it relied on under Specs and decisions, and the feasibility
verdict SHALL list them in `specsRead`.

#### Scenario: A ticket on a capability with a spec
- **WHEN** a ticket touches a capability that has a spec under `openspec/specs/`
- **THEN** the explorer's report cites that spec by path

#### Scenario: Nothing recorded
- **WHEN** no spec or archived change bears on the ticket
- **THEN** the report says so and the verdict may leave `specsRead` out
