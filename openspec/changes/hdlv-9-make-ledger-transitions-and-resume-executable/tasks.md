## 1. Tests first

- [ ] 1.1 Write the failing resume test: a bare key with reconciled `[drafted]`, `[ready !N]`, and `[reviewed-blocked !N]` selects execute, release readiness, and address comments, each as a single action
- [ ] 1.2 Write the failing explicit-verb test: `execute` at `[drafted]` and `draft` at `[groomed]` run only that step
- [ ] 1.3 Write the failing stop test with a recording writer: illegal `execute` at `[ready !N]`, an unknown command word, and a status with nothing next all stop and never call the writer
- [ ] 1.4 Write the failing contract test: Phase 0 routes a bare key to Resume, names the helper, says an illegal or unknown stop does not write the ledger, and Entry B no longer walks Stages 2 to 4

## 2. Implementation

- [ ] 2.1 Implement `classifyEntry` and `selectNextAction` in `factory/scripts/next-action.ts`, parsing the auto next-step table and Phase 0 verbs, and confirm the helper tests pass
- [ ] 2.2 Update `SKILL.md` Phase 0 and Entry B so a bare key resumes from the helper and explicit verbs stay single-step, and confirm the contract tests pass
- [ ] 2.3 Run the factory suite and delivery-specs and confirm they pass
