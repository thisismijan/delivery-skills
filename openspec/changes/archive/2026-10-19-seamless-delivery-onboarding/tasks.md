# Tasks

## 1. Canonical runtime manifest

- [x] 1.1 Add fail-closed default-manifest and overlay helpers in the runtime-manifest module; verify unit tests cover complete defaults, adapter overlay, provider overlay, and mutation enforcement preservation.
- [x] 1.2 Make every generic installation write `_factory/runtime-manifest.json` and compose selected adapters/providers transactionally; verify packaging tests cover generic, provider, Claude, and Cursor installs.
- [x] 1.3 Replace runtime-manifest placeholders in live stage contracts with `$FACTORY_ROOT/runtime-manifest.json`; verify workflow contract tests derive the canonical path.

## 2. Live doctor and target bootstrap

- [x] 2.1 Expand preflight into a stage-aware doctor that reports Ready now, Needs setup, Host limitation, and Human-owned groups; verify unit tests cover partial readiness and sanitised remedies.
- [x] 2.2 Add non-destructive probes for Bun version, dependencies, constitution, manifest, hook evidence, review wrappers, PATH, credential presence, supporting executables, OpenSpec, and target-state writability; verify secrets never appear in output.
- [x] 2.3 Add an idempotent target-repository init command that writes `.delivery/` and `.review/` ignore entries once, runs doctor, and prints valid first commands; verify outside-repository and repeated-run behavior.
- [x] 2.4 Wire `/delivery doctor` and `/delivery init` through conductor routing and help/status guidance; verify delivery contract tests cover both commands.

## 3. Truthful adapter and provider setup

- [x] 3.1 Make Claude setup additively and atomically install the mutation hook with backup and verification; verify unrelated settings and hooks survive and malformed settings fail unchanged.
- [x] 3.2 Keep Cursor mutation unenforced while improving its post-install readiness report; verify stage-gating tests continue to block mutating stages.
- [x] 3.3 Make GitLab, Jira, and OpenSpec provider setup/probes overlay only substantiated capabilities and emit exact remedies; verify missing credentials or tools remain unavailable.
- [x] 3.4 Print adapter-specific reload, doctor, PATH, and remaining setup actions without exposing secrets; verify installer output tests.

## 4. Documentation and integration

- [x] 4.1 Update README, runtime, and adapter/provider documentation to describe the one-command path and honest host limitations; verify copied commands and canonical paths against source contracts.
- [x] 4.2 Run `cd factory && bun run check && bun test` and verify the complete factory suite passes.
- [x] 4.3 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the complete delivery contract suite passes.

## Workflow follow-up

- Archive `seamless-delivery-onboarding` after implementation and review are complete.
