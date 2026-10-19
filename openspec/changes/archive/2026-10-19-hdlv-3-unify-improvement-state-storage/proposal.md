## Why

The conductor and README say improvement candidates and rollback copies belong under the target repository's `.delivery/`. The improve workflow still writes them next to the installed skill. Desktop and Cloud therefore store and reinstall different state, and an old skill-local candidate can be mistaken for a live install.

## What Changes

- Add a pure helper, `factory/scripts/improvement-state.ts`, that resolves the target repository's state root and the `candidates/` and `versions/` folders beneath it. `DELIVERY_STATE_ROOT` overrides the default `<target repo>/.delivery/`.
- The same helper detects leftover skill-local `candidates/` and `versions/` and returns a report with the destination path for each. It never moves, copies, or installs anything.
- Change `skills/delivery/workflows/improve.md` so candidates are prepared under `<state root>/candidates/` and recovery copies under `<state root>/versions/`, and so `status` reports legacy skill-local state with its migration path.
- Align `NOTES.md` and the ledger wording with the same locations.
- Keep the installer preserving skill-local `candidates` and `versions`, so a reinstall does not erase leftovers before status can report them.

Out of scope: widening which files self-improvement may modify, and changing the apply, reject, or rollback approval commands.

## Capabilities

### New Capabilities
- `improvement-state`: where improvement candidates and rollback copies live, and how leftover skill-local copies are reported.

### Modified Capabilities

None. No spec exists yet under `openspec/specs/`.

## Impact

- New: `factory/scripts/improvement-state.ts` and its test.
- Edited: `skills/delivery/workflows/improve.md`, `skills/delivery/workflows/NOTES.md`, `skills/delivery/workflows/delivery-ledger.md` (pointer only), `skills/delivery/checks/delivery-specs.test.ts`, `factory/scripts/install-hosts.test.ts`.
- `install.sh` behaviour is unchanged; its preserved folder list is covered by a test.
