# Tasks

## 1. Jira adapter operations

- [x] 1.1 Implement the version-1 CLI, configuration, credential loading, sanitised HTTP, and forbidden-operation guard in `providers/jira/jira-tracker.ts`; verify fixture-backed tests cover env/file credentials, argv isolation, 401 redaction, and rejected status/delete operations.
- [x] 1.2 Implement list and read with issue-type mapping, ADF body conversion, blocked-by links, and tagged notes; verify pagination and normalized schema tests with injected HTTP.
- [x] 1.3 Implement approved create with audit-id label/property idempotency and approved link replacement; verify replay, conflict, unapproved refusal, and blocker add/remove tests.
- [x] 1.4 Implement idempotent audit notes; verify first write, identical replay, and body update tests create at most one tagged comment.

## 2. Provider packaging and contracts

- [x] 2.1 Add Jira setup, `provider.json` tools, readiness probe, and provider README; verify provider-contract tests advertise `exec:` `tracker.item` when ready and stay unavailable with secret-safe reasons when not.
- [x] 2.2 Extend installer contract coverage for `--provider jira`; verify the executable is installed and runtime overlay matches readiness.

## 3. Integration verification

- [x] 3.1 Run `openspec validate executable-jira-tracker-provider --strict` and verify all change artifacts.
- [x] 3.2 Run focused factory tests for the adapter and provider contracts and verify they pass.
- [x] 3.3 Run `cd factory && bun run check && bun test` and verify the complete factory suite.

## Workflow follow-up

- Archive `executable-jira-tracker-provider` after implementation and review.
