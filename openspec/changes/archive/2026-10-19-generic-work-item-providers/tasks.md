# Tasks

## 1. Repository provider contract

- [x] 1.1 Add provider identity to remote work-item capability descriptors and verify manifest/provider tests reject unavailable or unnamed remote providers.
- [x] 1.2 Implement versioned option discovery, atomic repository selection, explicit replacement, and live validation; verify local, remote, repeated, malformed, and symlink cases.

## 2. First-use confirmation

- [x] 2.1 Integrate work-item selection into target initialization without choosing implicitly; verify init can list options and persist an exact confirmed choice.
- [x] 2.2 Require a valid selection before work-item-dependent delivery entries while leaving help and doctor read-only; verify conductor routing contracts cover first use and reuse.
- [x] 2.3 Report selected, missing, and unavailable provider states in doctor with secret-safe remedies; verify diagnostic tests.

## 3. Provider-neutral lifecycle

- [x] 3.1 Generalize work-item normalization and local-file materialization while preserving approval and status boundaries; verify normalized provider tests.
- [x] 3.2 Replace tracker-specific grooming and delivery handoffs with selected-provider behavior; verify workflow contract tests cover local files and remote providers.
- [x] 3.3 Document repository selection, Jira, forge-issue, local-file, and custom-provider behavior; verify copied commands and capability names against source contracts.

## 4. Integration verification

- [x] 4.1 Run `openspec validate generic-work-item-providers --strict` and verify all artifacts are valid.
- [x] 4.2 Run `cd factory && bun run check && bun test` and verify the complete factory suite passes.
- [x] 4.3 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the complete delivery contract suite passes.

## Workflow follow-up

- Archive `generic-work-item-providers` after implementation and review are complete.
