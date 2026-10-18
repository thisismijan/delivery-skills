# Tasks

## 1. Complete local operations

- [x] 1.1 Define strict normalized work-item, create, link, and note schemas; verify malformed and unapproved requests fail before writes.
- [x] 1.2 Implement collision-safe local allocation plus list/read/create operations; verify atomic idempotency and legacy markdown reads.
- [x] 1.3 Implement local dependency links and idempotent audit notes; verify repeated calls and missing references fail safely.

## 2. Executable remote protocol

- [x] 2.1 Validate `exec:` remote invocations and implement shell-free JSON dispatch; verify fake-adapter success, non-zero exit, malformed output, and secret-safe errors.
- [x] 2.2 Route every operation through repository selection and live runtime validation; verify local and remote integration paths.

## 3. Workflow integration and documentation

- [x] 3.1 Replace provider-operation prose in live skills with exact normalized commands; verify workflow contracts prohibit improvised remote calls.
- [x] 3.2 Update work-item and adapter documentation with protocol, migration, and human-owned boundaries; verify copied commands against source contracts.

## 4. Integration verification

- [x] 4.1 Run `openspec validate executable-work-item-providers --strict` and verify all artifacts.
- [ ] 4.2 Run `cd factory && bun run check && bun test` and verify the complete factory suite.
- [ ] 4.3 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the complete delivery suite.

## Workflow follow-up

- Archive `executable-work-item-providers` after implementation and review.
