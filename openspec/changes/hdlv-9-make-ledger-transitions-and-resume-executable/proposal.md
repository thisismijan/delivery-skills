## Why

`/delivery <KEY>` starts a ticket span (Stages 2 to 4) instead of resuming from the reconciled ledger. Auto is the only path that reads status tags. Illegal transitions are not enforced in code; they depend on the conductor remembering the next-step table. Operators therefore re-run finished work or skip required steps.

## What Changes

- Classify `/delivery` arguments as a bare key, an explicit verb, or unknown.
- A bare key with a reconciled ledger status selects the legal next action from the auto next-step table and runs that action.
- An explicit verb still runs only that step, and only when it is legal for the reconciled status.
- An illegal or unknown transition stops without calling the durable ledger writer.
- Out of scope: recovering an interrupted execute process (HDLV-12), and changing who may mark a merge request ready (HDLV-10).

## Capabilities

### New Capabilities
- `ledger-transitions`: classify a delivery entry, select the legal next action from reconciled ledger status, and refuse illegal or unknown transitions without mutating the ledger.

### Modified Capabilities

None.

## Impact

- `factory/scripts/next-action.ts` and `factory/scripts/next-action.test.ts`
- `skills/delivery/SKILL.md` (Phase 0 entry detection and Entry B)
- `skills/delivery/checks/delivery-specs.test.ts`
