## Why

The groom explorer and the feasibility analyst mapped only code. Neither read
`openspec/specs/` or the archived changes, so a decision already made and
recorded about an area could be re-argued in grilling or contradicted in a new
plan. Specs and archived designs are also smaller than the code they describe,
so they are a cheaper first read.

## What Changes

- Both agents read the relevant specs and archived proposals and designs before
  code: capabilities whose name or text matches the ticket's domain terms, and
  the matching archived changes, newest first.
- The explorer cites each one it relied on under a new **Specs and decisions**
  section of its report, or says none bear on the input.
- The feasibility verdict gains an optional `specsRead` list of the specs and
  archived changes the analyst relied on. Where the code contradicts a spec, the
  analyst trusts the code and names the contradiction in `risks`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `groom-evidence-pushback`: the explorer reads and cites past decisions before
  mapping code, and feasibility does the same.

## Impact

- `factory/agents/groom-explorer.md`, `factory/agents/feasibility-analyst.md`
- `factory/scripts/verdicts.ts`
