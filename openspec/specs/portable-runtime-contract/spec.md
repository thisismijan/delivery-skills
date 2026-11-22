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

#### Scenario: Session tool needs a service locator
- **WHEN** a mapped tool requires a repository path, owner and repository, or cloud site identifier
- **THEN** the plan supplies that locator from the git remote or confirmed repository settings instead of guessing or omitting it

#### Scenario: Multiple integration servers are present
- **WHEN** the recorded inventory contains tools from more than one server
- **THEN** each operation uses a tool from its own provider family and never borrows a same-named tool from another server

### Requirement: Provider commands describe their own inputs

`forge-provider.ts`, `work-item-provider.ts`, `review-fanout.ts`, and
`forge-comments.ts` SHALL print every operation's input shape with `--help`,
derived from the schema the command validates against, and exit zero. The
runtime notes SHALL tell a session never to read a script's source to learn
how to call it.

#### Scenario: Help for one operation

- **WHEN** `forge-provider.ts --help note` runs
- **THEN** it prints the note input's fields, marking optional ones, and exits zero

### Requirement: Runtime notes load rarely needed detail on demand

`RUNTIME.md` SHALL keep runtime resolution, dispatch, provider, and model
inventory rules, and SHALL point to `reference/model-evaluation.md` and
`reference/review-fanout.md` with the condition under which each is read.

#### Scenario: A stage without review lenses

- **WHEN** a stage that fans out no review lenses loads the runtime notes
- **THEN** it does not need to read the review fan-out reference

### Requirement: A run reuses a recent host-tool inventory

`mcp-inventory.ts fresh` SHALL exit zero only when the recorded inventory
parses, is not empty, is not dated in the future, and is younger than the
maximum age. A run SHALL reuse such an inventory instead of listing the host's
tools, and SHALL record it again when a planned tool is missing or
unauthenticated.

#### Scenario: Old inventory

- **WHEN** the inventory was recorded more than 12 hours ago
- **THEN** `fresh` exits non-zero with the reason, and the run records the tools again

### Requirement: Long commands keep their output in files

`quiet-run.ts` SHALL run a command without a shell, keep its whole output in a
log file, exit with the command's code, and print only the lines that name a
failure and the end of the run.

#### Scenario: Failing typecheck

- **WHEN** a typecheck run through `quiet-run.ts` fails among hundreds of lines
- **THEN** the printed excerpt holds the error lines and the last lines, and the log holds everything
