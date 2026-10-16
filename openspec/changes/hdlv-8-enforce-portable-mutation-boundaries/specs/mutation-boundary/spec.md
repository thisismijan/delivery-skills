## ADDED Requirements

### Requirement: Human-owned commands are denied
The guard SHALL deny merge, close, Jira mutation, force-push, hard reset, and equivalent `glab`, `gh` or `curl` API calls, and SHALL allow read-only calls.

#### Scenario: Merge or close is denied
- **WHEN** a command merges or closes a merge request through the CLI or through an API call
- **THEN** the decision is blocked with a reason naming the human-owned action

#### Scenario: Jira mutation is denied
- **WHEN** a command or tool name creates, edits or transitions a Jira issue through the tool or the REST API
- **THEN** the decision is blocked

#### Scenario: Force-push and hard reset are denied
- **WHEN** a push uses a force flag or a plus-prefixed refspec, or a command runs a hard reset
- **THEN** the decision is blocked

#### Scenario: Reads stay allowed
- **WHEN** a command only reads merge requests or Jira issues with a GET
- **THEN** the decision is not blocked

### Requirement: The hook adapter fails closed
The Claude Code hook SHALL return a deny decision for any payload it cannot interpret, including a payload with no command.

#### Scenario: Forbidden command payload
- **WHEN** the hook receives a payload whose command is forbidden
- **THEN** it prints a deny decision with the reason

#### Scenario: Malformed payload
- **WHEN** the payload is not valid JSON or has no command
- **THEN** the hook prints a deny decision
