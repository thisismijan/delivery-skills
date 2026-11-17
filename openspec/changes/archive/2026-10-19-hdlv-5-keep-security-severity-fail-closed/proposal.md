## Why

Release readiness downgrades a Critical or High security finding to Important when it has no proof of concept. An incomplete reproduction then becomes a GO path, so a plausible serious finding can be hidden by missing evidence. Operators still need a way to accept a named risk, but only for the exact head that was assessed.

## What Changes

- A Critical or High security finding with incomplete reproduction keeps its severity, keeps blocking, and is marked unverified. It is never downgraded to Important.
- Only an operator can accept such a risk. The acceptance is recorded in the ledger's Approvals, scoped to the merge request and the assessed head, with the operator's words.
- When the head changes, the acceptance no longer applies and the finding blocks again at readiness recompute.
- A pure readiness decision helper makes these rules executable and testable. The release-readiness workflow and its markdown contract checks state the same rules and expose the unverified marker.

## Capabilities

### New Capabilities

- `release-readiness`: how security findings, their verification status, and head-scoped operator risk acceptance decide GO or NO-GO.

### Modified Capabilities

None.

## Impact

- `skills/delivery/workflows/release-readiness.md`: Security lens, Decide step, brief template.
- `factory/scripts/readiness-decision.ts` (new, pure) and its test.
- `skills/delivery/checks/delivery-specs.test.ts`: contract checks for the workflow wording.
- Out of scope: replacing repository security scanners, inventing a new severity scale.
