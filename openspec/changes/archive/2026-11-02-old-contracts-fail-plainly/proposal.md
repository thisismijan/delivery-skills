## Why

After the reinstall at bb620b0, `sdlc-constitution.ts check` rejected
MDF-3212's frozen run contract with a raw schema error. The contract names a
human-owned action, `tracker-status`, that the board-status change removed
from the constitution. Any further mutating stage on that run would stop with
no hint of what to do. `supersede`, the way to move a run forward, parsed the
old contract with the same strict schema, so the run could not be superseded
either. The land gate read the contract the same way.

## What Changes

- A contract whose only incompatibility is a human-owned action the live
  constitution no longer has fails with `OutdatedRunContractError`. The
  message names the retired action and the contract hash, and gives the
  supersede command.
- A contract that parses but was frozen under another constitution gets the
  same supersede advice instead of "re-approve the plan".
- `check` and `level` report either case as their usual JSON with exit 1, not
  a crash.
- `supersede` accepts an old contract as the current one, as long as its hash
  still matches its body. The proposal must still be frozen under the live
  constitution, with a new plan version, the superseded hash, a reason, the
  affected invariant, and a new approval.
- A tampered or malformed contract fails as before.
- Troubleshooting explains the message and the steps.

## Capabilities

### New Capabilities

- `run-contract-compatibility`: runs frozen under an older constitution fail
  plainly and can be superseded.

### Modified Capabilities

None.

## Impact

- `factory/scripts/sdlc-constitution.ts` and a new test file;
  `docs/troubleshooting.md`
