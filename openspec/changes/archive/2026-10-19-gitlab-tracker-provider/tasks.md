# Tasks

## 1. Shared GitLab host module

- [x] 1.1 Extract origin, token, pagination, and injected HTTP helpers from gitlab-forge into `providers/gitlab/gitlab-host.ts`; verify existing `gitlab-forge.test.ts` still passes.
- [x] 1.2 Keep gitlab-forge importing the shared helpers and re-exporting the symbols its tests use; verify forge CLI credential failures still omit secrets.

## 2. GitLab work-item adapter

- [x] 2.1 Implement `providers/gitlab/gitlab-work-item.ts` list/read against injected HTTP; verify pagination, numeric refs, and WorkItem schema validation in a new `gitlab-work-item.test.ts`.
- [x] 2.2 Implement approved create with audit-id idempotency and caller-ref rejection; verify replay, conflict, and unapproved create tests send no write.
- [x] 2.3 Implement approved link for `is_blocked_by` dependencies; verify missing links are added and a shrinking set is refused without DELETE.
- [x] 2.4 Implement idempotent notes and refuse close/delete/status operations; verify note replay, forbidden operations, and sanitised failures never include tokens or stderr dumps.

## 3. Provider contract, setup, and packaging

- [x] 3.1 Extend provider-contract so a provider may advertise multiple capabilities additively; verify GitLab ready overlays forge, review, and tracker with `exec:` paths and that Jira/OpenSpec stay compatible.
- [x] 3.2 Update GitLab `provider.json`, setup, cloud-setup, and README to install gitlab-forge, gitlab-work-item, and the shared host module; verify install-packaging and provider-contract tests expect all three GitLab capabilities.
- [x] 3.3 Point doctor at the GitLab executables instead of compatibility wrappers; verify doctor names remedies without printing credentials.

## 4. Retire compatibility wrappers

- [x] 4.1 Confirm generic skills, workflow-contracts, and delivery-specs invoke forge-provider and work-item-provider rather than `gl-mr` or `gl-note`.
- [x] 4.2 Remove `providers/gitlab/gl-mr`, `gl-note`, `factory/scripts/gl-note.test.ts`, and obsolete docs/test expectations; verify packaging no longer installs those tools.

## 5. Integration verification

- [x] 5.1 Run `openspec validate gitlab-tracker-provider --strict` and verify the change artifacts pass.
- [x] 5.2 Run focused GitLab and provider tests (`gitlab-work-item`, `gitlab-forge`, `provider-contract`, `install-packaging`, `work-item-provider`) and verify they pass.
- [x] 5.3 Run `cd factory && bun run check && bun test` and verify the complete factory suite.
- [x] 5.4 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the delivery suite.

## Workflow follow-up

- Archive `gitlab-tracker-provider` after implementation and review.
