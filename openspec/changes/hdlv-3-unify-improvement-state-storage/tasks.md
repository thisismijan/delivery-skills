## 1. Tests first

- [ ] 1.1 Write `factory/scripts/improvement-state.test.ts` using a temp target repo and temp skill directory: default root is `<repo>/.delivery`, `DELIVERY_STATE_ROOT` overrides it, candidate and version folders resolve under the root, and detection reports seeded legacy candidates and versions with their destinations.
- [ ] 1.2 In the same file, test that detection performs no writes (the skill folder and state root are byte-identical before and after) and that an empty or missing skill folder yields no entries.
- [ ] 1.3 Add spec-text assertions in `skills/delivery/checks/delivery-specs.test.ts`: `improve.md` names `<state root>/candidates/` and `<state root>/versions/`, status mentions the migration path and report-only behaviour, legacy copies are never apply-eligible, and `NOTES.md` agrees. Derive path strings from one constant.
- [ ] 1.4 Add a case in `factory/scripts/install-hosts.test.ts` that seeds skill-local `candidates` and `versions` leftovers and checks a reinstall preserves them.
- [ ] 1.5 Run the new tests and confirm the helper and spec-text tests fail for the expected reasons.

## 2. Helper

- [ ] 2.1 Implement `factory/scripts/improvement-state.ts` with `resolveStateRoot`, `improvementPaths` and `detectLegacyState`, read-only and free of Node-global assumptions beyond `node:fs` and `node:path`.

## 3. Workflow text

- [ ] 3.1 Update `skills/delivery/workflows/improve.md` Storage, Prepare, Apply, Rollback and Never sections to the state root, keeping the baseline-hash exclusions.
- [ ] 3.2 Add the legacy report rule to the `status` command text in `improve.md`.
- [ ] 3.3 Update the location rows in `skills/delivery/workflows/NOTES.md` and add a legacy pointer in `delivery-ledger.md`.

## 4. Verify

- [ ] 4.1 Run the full factory and delivery test suites and confirm they are green.
