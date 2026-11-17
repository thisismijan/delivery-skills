## Why

The repository named the organisation and the internal plugin these skills
were derived from, in a provenance notice, adapter docs, a migration adapter,
a forbidden-token guard, test fixtures, example ticket keys, and archived
change notes. The operator asked for every such mention to go.

## What Changes

- Remove the migration adapter, which existed only to read the old plugin's
  state files, and its tests.
- Remove the source-framework token from the generic-boundary guard; hosts,
  vendors, forges, and trackers stay forbidden in generic files.
- Rewrite the provenance notice and the Claude Code adapter note without the
  names.
- Replace the old project keys in examples and tests with neutral ones
  (`ABC-`, `XYZ-`).
- Neutralise infrastructure hosts and paths in the CI failure fixtures.
- Reword archived proposals that cited real runs and tickets.
- Correct the factory lockfile's package name to match `package.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: the vendor-neutral guard no longer lists a
  source framework.

## Impact

Many files across docs, skills, factory scripts and tests, fixtures, and the
archive. `adapters/migration/` and `factory/scripts/migration-adapter.test.ts`
are deleted. Git history is unchanged.
