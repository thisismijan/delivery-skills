# generic-work-items

## Purpose

Provides explicit, repository-scoped selection and provider-neutral handling
of delivery work items across local and remote systems.

## Requirements

### Requirement: First lifecycle use confirms the work-item provider
The system SHALL require an explicit operator choice before the first
work-item-dependent lifecycle action in a repository and SHALL NOT infer that
choice from remotes, credentials, host identity, environment variables, or key
shape.

#### Scenario: Repository has no selection
- **WHEN** delivery first needs to read or materialize a work item
- **THEN** it presents local files plus every currently substantiated runtime provider and waits for explicit confirmation

#### Scenario: Help and diagnosis do not force a choice
- **WHEN** the operator runs help or doctor before selecting a provider
- **THEN** the command reports the missing repository choice without writing configuration

### Requirement: Confirmed choice is durable and changeable
The system SHALL persist one versioned work-item provider selection in the
target repository and SHALL reuse it until the operator explicitly replaces
it.

#### Scenario: Later delivery run
- **WHEN** a valid confirmed selection already exists
- **THEN** delivery uses it without asking again

#### Scenario: Operator changes provider
- **WHEN** the operator explicitly selects a different provider
- **THEN** the system replaces only the provider configuration and does not move, duplicate, or mutate existing work items

### Requirement: Local files are a complete baseline provider
The system SHALL always offer a local-files provider that can durably identify,
read, create, and link approved work items without a network service.

#### Scenario: Local files selected
- **WHEN** the operator confirms local files
- **THEN** approved work items use repository-local identifiers and files and no tracker capability is required

### Requirement: Remote providers are advertised truthfully
The system SHALL offer a remote provider only when the runtime substantiates
the work-item capability and names the exact provider identity and invocation.

#### Scenario: Jira is configured
- **WHEN** a live Jira adapter advertises work-item operations
- **THEN** Jira appears as a selectable provider

#### Scenario: Forge issues are configured
- **WHEN** a live forge-issues adapter advertises work-item operations
- **THEN** that forge issue provider appears as a selectable provider

#### Scenario: Remote provider becomes unavailable
- **WHEN** the saved provider is no longer substantiated by the runtime
- **THEN** delivery stops with a setup or explicit reselection remedy and does not silently fall back to local files

### Requirement: Lifecycle language and boundaries are provider-neutral
The system SHALL route work-item reads, creation, dependency links, and
handoffs through the confirmed provider while keeping status transitions and
unapproved item creation human-owned.

#### Scenario: Approved continuous plan
- **WHEN** the operator approves verified work-item drafts
- **THEN** delivery materializes exactly those items through the selected provider and records their normalized keys

#### Scenario: Provider write is unavailable
- **WHEN** the selected provider cannot create or link an approved work item
- **THEN** delivery preserves the verified drafts and stops with an exact remedy
