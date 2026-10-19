# Tasks

## 1. Canonical decision brief

- [x] 1.1 Add the canonical multi-option decision-brief contract and compact example to `skills/delivery/SKILL.md`; verify a delivery contract test derives and asserts every required field.
- [x] 1.2 Define when the brief applies and its exclusions for factual questions, single viable paths, and simple confirmations; verify contract tests cover both an applicable and an excluded checkpoint.
- [x] 1.3 Require evidence/assumption separation, a recommendation with change triggers, reversibility, and no-answer consequences; verify the conductor contract test fails when any element is removed.

## 2. Technical teaching lenses

- [x] 2.1 Add the DSA lens contract covering data structures, time/space complexity, and concurrency only when material; verify tests require an explicit no-material-difference statement instead of fabricated complexity.
- [x] 2.2 Add the system-design lens contract covering boundaries, state, consistency, scaling, reliability, security, and operability only when material; verify tests require either concrete consequences or an explicit no-material-difference statement.
- [x] 2.3 Add plain-language and depth-scaling rules so irreversible or cross-system choices receive more detail than routine reversible choices; verify the contract names both depth classes.

## 3. Workflow adoption

- [x] 3.1 Update discovery and grooming workflows and their stage skills to use the canonical brief before multi-option product or slicing decisions; verify their existing contract suites assert the reference.
- [x] 3.2 Update recovery and exception paths in the conductor and auto workflow to use the canonical brief when more than one safe recovery option exists; verify guarded-transition behavior remains fail closed.
- [x] 3.3 Update release-readiness and improvement workflows to use the canonical brief for risk, rollback, candidate, or architecture alternatives without weakening human-owned gates; verify workflow contract tests preserve those boundaries.
- [x] 3.4 Audit the remaining live workflows for multi-option human prompts, add the canonical reference where applicable, and verify a repository-wide contract test reports no ungoverned multi-option checkpoint.

## 4. Integration verification

- [x] 4.1 Run `cd factory && bun run check && bun test` and verify the complete factory suite passes.
- [x] 4.2 Run `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks` and verify the complete delivery contract suite passes.

## Workflow follow-up

- Archive `explain-human-decisions` after implementation and review are complete.
