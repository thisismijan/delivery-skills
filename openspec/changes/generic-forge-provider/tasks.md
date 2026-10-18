# Tasks

## 1. Normalized forge command

- [x] 1.1 Define strict change, review-evidence, mutation-input, and receipt schemas; verify malformed results and unapproved mutations fail before adapter execution.
- [x] 1.2 Implement capability routing and shell-free executable dispatch; verify absent, mismatched, relative, failed, noisy, and malformed adapters fail safely.
- [x] 1.3 Integrate note publication checks and dry-run behavior; verify unsafe paths and secret-like bodies never reach an adapter.

## 2. GitLab provider

- [x] 2.1 Implement normalized GitLab find/read/files/diff/commits/discussions/anchors operations; verify pagination, opaque references, revision binding, and diff overflow behavior with fixture-backed tests.
- [x] 2.2 Implement approved create/set-draft/note/reply operations; verify request shapes, dry-run boundaries, and normalized receipts without exposing credentials.
- [x] 2.3 Update provider setup, readiness, and runtime manifests to advertise the executable with provider identity; verify install and provider contract tests.

## 3. Workflow integration

- [x] 3.1 Route execute and address-comments through exact normalized commands; verify no generic skill calls provider-native helpers.
- [x] 3.2 Route code-review-max and mr-review evidence/publication through exact normalized commands; verify review order and per-note approval checkpoints remain intact.
- [x] 3.3 Route delivery conductor workflows through normalized change reads; verify destructive lifecycle actions remain human-owned.

## 4. Documentation and integration verification

- [x] 4.1 Update generic and GitLab provider documentation; verify copied commands and capability names against source contracts.
- [x] 4.2 Run `openspec validate generic-forge-provider --strict` and verify all change artifacts.
- [ ] 4.3 Run `cd factory && bun run check && bun test` and verify the complete factory suite.
- [ ] 4.4 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the complete delivery suite.

## Workflow follow-up

- Archive `generic-forge-provider` after implementation and review.
