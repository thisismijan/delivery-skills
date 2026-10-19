## 1. Tests first

- [x] 1.1 Add `factory/scripts/readiness-decision.test.ts` covering every scenario under "Unverified serious security findings keep blocking" and "Operator risk acceptance is recorded and scoped to the assessed head" (seam 1, pure helper)
- [x] 1.2 Add contract checks to `skills/delivery/checks/delivery-specs.test.ts` for the "readiness workflow states the fail-closed rule" scenario: no downgrade wording, Critical and High in NO-GO, operator-only head-scoped acceptance, unverified marker in the brief (seam 2, markdown contract)
- [x] 1.3 Run the new tests and confirm they fail for the right reason

## 2. Implementation

- [x] 2.1 Implement `factory/scripts/readiness-decision.ts` (`decideReadiness`) until 1.1 passes
- [x] 2.2 Update `skills/delivery/workflows/release-readiness.md` (Security lens, Decide, brief template) until 1.2 passes
- [x] 2.3 Check `skills/delivery/workflows/delivery-ledger.md` Approvals wording names the head, and align it if not

## 3. Verify

- [x] 3.1 Run `bun run check` in `factory/` and the root test suites; all green
