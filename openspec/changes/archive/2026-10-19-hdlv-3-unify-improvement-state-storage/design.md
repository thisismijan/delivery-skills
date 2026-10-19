## Context

The improve workflow is prose that an agent follows. Nothing in code reads or writes candidates or versions, and the only enforcement is substring assertions in `skills/delivery/checks/delivery-specs.test.ts`. The ledger spec already defines the state root as `<target repo>/.delivery/` with a `DELIVERY_STATE_ROOT` override, and `SKILL.md` already says live state never sits beside the installed skill. `improve.md` and `NOTES.md` contradict that.

## Goals / Non-Goals

**Goals**
- One state root for runs, candidates, versions and routing, identical on desktop and Cloud.
- A deterministic, testable way to resolve it and to find legacy skill-local state.
- Legacy state is reported with a migration path and is never installed.

**Non-Goals**
- Moving or copying legacy files automatically.
- Changing apply, reject, or rollback commands, or which files improvement may touch.

## Decisions

**Pure helper.** `factory/scripts/improvement-state.ts` exports:

```ts
resolveStateRoot(env: { DELIVERY_STATE_ROOT?: string }, targetRepo: string): string
improvementPaths(stateRoot: string): { candidates: string; versions: string }
detectLegacyState(skillDir: string, stateRoot: string): Promise<LegacyReport>
type LegacyReport = { entries: { kind: "candidate" | "version"; name: string; from: string; to: string }[] }
```

`detectLegacyState` only reads the skill folder. It returns, per leftover entry, the current path and the state-root destination. It performs no writes, which is what makes "never moved or installed" a structural property rather than a promise. An empty or missing folder yields no entries.

**Report-only migration.** Status prints the report and the destination. Moving is a manual operator action. A legacy entry is never apply-eligible: `apply` and `rollback` name candidates and versions found under the state root only.

**Installer keeps preserving the folders.** `install.sh` already skips `runs`, `candidates` and `versions` when it removes managed entries. That keeps leftovers visible to the report. No installer change is planned, only a test.

**Reuse the existing override.** `DELIVERY_STATE_ROOT` from `delivery-ledger.md` is reused, so Cloud and desktop differ only in that value.

## Approved test seams

The operator approved these seams.

1. **`improvement-state.ts` public functions, against temp directories.**
   - Catches: wrong default root, override ignored, wrong candidate or version folder, legacy detection missing a candidate or version, any write to the skill folder or state root during detection, and a legacy entry reported without a destination.
   - Misses: whether an agent following `improve.md` actually writes to those folders at runtime.
   - Fakes: a temp directory as the target repository, a temp directory as the installed skill seeded with legacy entries, and an explicit env object. No network, model, or git fakes.
2. **Bundled workflow text via `SPECS` in `skills/delivery/checks/delivery-specs.test.ts`.**
   - Catches: `improve.md`, `NOTES.md` and `SKILL.md` drifting apart on storage paths, status failing to mention the migration path, or text that allows installing a legacy copy.
   - Misses: runtime behaviour and the real status output format.
   - Fakes: none. Path strings are taken from one constant in the test.
3. **Installer preservation through `runInstaller` in `factory/scripts/install-hosts.test.ts`.**
   - Catches: a reinstall deleting skill-local `candidates` or `versions` before status can report them.
   - Misses: anything about state-root content, which the installer never touches.
   - Fakes: the existing temp store and `CURSOR_AGENT_STORE` fixtures.

## Risks / Trade-offs

- Prose tests assert exact substrings, so reworded paths in `improve.md` need deliberate test updates and no weakened assertions.
- The baseline-hash exclusions and the Never list must still name `runs/`, `candidates/` and `versions/` so state-root content cannot enter the managed-tree hash.
- Cloud and desktop equivalence is covered through the shared helper and documented override, not by running both hosts.
