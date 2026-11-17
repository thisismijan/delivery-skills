## Why

The test writer and the implementer received the work item and the spec, but
nothing showed what the affected code already exports. Each had to grep the
repository to find existing functions to reuse, paying for that search on every
dispatch, and could miss a helper and write a second one.

## What Changes

- A new `code-map.ts <repoRoot> <changeDir>` lists the exported top-level symbols
  of the tracked files in the change's affected areas: the feasibility
  `affectedAreas` recorded in the change metadata and the proposal's Impact
  paths, leaving out tests. It reads TypeScript and JavaScript, Python, Go, Java,
  and Kotlin by pattern, without a model, and stays within a fixed size cap,
  naming how many files it left out.
- `review-packet.ts` gains a repeatable `--context <file>` that puts a whole file
  into the packet under a Context heading, unlike evidence, which keeps only its
  tail.
- `/execute` builds the map before dispatching the test writer and passes it to
  the test-writer and implementer packets. The holdout review packet gets none.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: execute workers receive a capped code map so they
  search less.

## Impact

- New `factory/scripts/code-map.ts`; `factory/scripts/review-packet.ts`
- `skills/execute/SKILL.md`, `docs/reference.md`
