## 1. Classifier

- [x] 1.1 Add fail-closed tests for complete rename, incomplete free text, public-contract, unknown operation, and safety surfaces in `factory/scripts/mechanical-edit.test.ts`.
- [x] 1.2 Implement `classifyMechanicalEdit` and a CLI in `factory/scripts/mechanical-edit.ts` that returns `mechanical` or `not-mechanical` with a reason.

## 2. Routing eligibility

- [x] 2.1 Extend task-profile work types with `mechanical-edit` and fail closed on unknown values.
- [x] 2.2 Make classified mechanical-edit fast-eligible when reversible, local, known-pattern, and strongly verified; keep implement and write-tests at the standard floor.
- [x] 2.3 Prove named safety floors still block mechanical-edit auth work, and that live `select-model` still never returns a fast catalogue model.

## 3. Workflow contracts

- [x] 3.1 Test that execute and address-comments classify before a fix dispatch, do not ask the worker whether the work is menial, prefer scripted apply, and do not dispatch evaluation-only models.
- [x] 3.2 Wire those rules into execute and address-comments skills. Nitpick comments stay dispute-only.

## 4. Documentation

- [x] 4.1 Document mechanical-edit units, script-first apply, and evaluation-only fast models in README and runtime docs.

## 5. Verification

- [x] 5.1 Run `bun test factory/scripts/mechanical-edit.test.ts factory/scripts/shadow-route.test.ts factory/scripts/select-model.test.ts factory/scripts/fast-dispatch.test.ts factory/scripts/workflow-contracts.test.ts` from the factory directory.
- [x] 5.2 Run factory `bun run check` and delivery-specs checks that cover routing contracts.
