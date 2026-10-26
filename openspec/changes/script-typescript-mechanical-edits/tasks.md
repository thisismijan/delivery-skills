## 1. Apply helper

- [x] 1.1 Add fail-closed tests for complete rename, incomplete graph, string literals, ambiguous symbols, non-TypeScript files, and import-only in `factory/scripts/apply-mechanical-edit.test.ts`.
- [x] 1.2 Implement `applyMechanicalEdit` and a CLI in `factory/scripts/apply-mechanical-edit.ts`.

## 2. Runtime dependency

- [x] 2.1 Ship `typescript` as a factory production dependency so the installed pack can apply.

## 3. Workflow contracts

- [x] 3.1 Point execute and address-comments at the apply helper with the repo root, and treat `apply: script` as already written.
- [x] 3.2 Document the TypeScript rename script in README and runtime docs.

## 4. Verification

- [x] 4.1 Run the apply-helper tests plus factory `bun run check` and delivery-spec coverage for the new command.
