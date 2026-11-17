# Tasks

## 1. Shared GitHub client and packaging

- [x] 1.1 Add `providers/github/` with `provider.json`, `setup.sh`, and a shared client that resolves token, host, and repository, and verify origin parsing, override, and credential-file tests pass without network.
- [x] 1.2 Evolve `provider-contract.ts` so a manifest may advertise multiple capabilities while forge-only GitLab and tracker-only Jira keep current behavior, and verify provider-contract tests cover both shapes.
- [x] 1.3 Document the GitHub provider README for install, token sources, overrides, and human-owned operations, and verify install packaging copies both executables without embedding pack paths.

## 2. Forge and review adapter

- [x] 2.1 Implement GitHub find/read/files/diff/commits/discussions/anchors with pagination and complete-diff refusal, and verify fixture-backed injected-HTTP tests parse through `parseForgeOperationResult`.
- [x] 2.2 Implement approved create/set-draft/note/reply, draft endpoints, and safe review-thread mapping, and verify unapproved, truncated, human-owned, and inline-anchor cases never call GitHub.
- [x] 2.3 Cover CLI argv plus version-1 JSON stdin, missing credentials, and token redaction, and verify the GitHub forge CLI tests pass.

## 3. Tracker adapter

- [x] 3.1 Implement GitHub issue list/read/create/link/note with audit-id idempotency and additive dependency links, and verify fixture-backed injected-HTTP tests match `WorkItem` output.
- [x] 3.2 Refuse status changes, deletes, and dependency removals, and verify conflicting audit replay leaves the existing issue unchanged.
- [x] 3.3 Cover tracker CLI protocol and shared-client token/repo discovery, and verify GitHub tracker tests pass with no network.

## 4. Integration verification

- [x] 4.1 Run `openspec validate github-provider-adapters --strict` and verify the change artifacts pass.
- [x] 4.2 Run focused factory tests for GitHub, provider-contract, and install packaging, then `cd factory && bun run check && bun test`, and verify they pass.
- [x] 4.3 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` if delivery checks are touched, otherwise confirm they were not, and mark tasks complete.

## Workflow follow-up

- Archive `github-provider-adapters` after implementation and review.
