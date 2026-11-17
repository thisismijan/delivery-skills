## Why

`/delivery` loads its workflow specifications from `skills/delivery/workflows/`. Two files there still read as live authority although they describe retired behaviour: `NOTES.md` ("Three stage workflows are source of truth", "Factory opens ready MRs", Claude Code as the runtime host) and `delivery-orchestrator.md` (a three-stage flow, with "Source of truth for stage behavior remains the three stage files"). The live rules are in `skills/delivery/SKILL.md` (the conductor), `workflows/auto.md` (the next-step table) and the current stage specs. A maintainer or a later session can follow a stale file and override the live lifecycle. The contract suite also reads those historical files for live wording (for example the `~25%` sizing check reads `NOTES.md`), so a live rule change would force edits to stale text.

## What Changes

- `SKILL.md` "Source of truth" declares which files are live and which are historical and non-actionable, and states that historical files cannot override the live ones.
- `workflows/NOTES.md` and `workflows/delivery-orchestrator.md` are marked historical and non-actionable, and their claims to be the source of truth or to describe current behaviour are removed or rewritten.
- `skills/delivery/checks/delivery-specs.test.ts` draws live-wording assertions from live files only, with one named list of historical files, and gains a test that runs the contract suite against a copied skill root whose historical files are contradicted.

No change to lifecycle transitions, review readiness, ledger writes, or operator-facing commands.

## Capabilities

### New Capabilities
- `delivery-workflow-authority`: which delivery documents are actionable, and the guarantee that historical documents cannot change current behaviour or the contracts that guard it.

### Modified Capabilities
None.

## Impact

- `skills/delivery/SKILL.md`, `skills/delivery/workflows/NOTES.md`, `skills/delivery/workflows/delivery-orchestrator.md`
- `skills/delivery/checks/delivery-specs.test.ts`
- Other workflow specs that link to `NOTES.md` for terms keep working. It stays as reference-only terminology.
