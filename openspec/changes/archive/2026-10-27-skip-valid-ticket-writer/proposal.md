## Why

A structurally valid ticket input already skips the explorer. After
approval, `/groom` still dispatched a writer to re-emit that same
document. The verifier already accepted it. A model cannot add required
sections that are already present.

## What Changes

- When Step 2a passed and the operator approved that content without a
  rewrite, copy `source.md` to the final draft path after a second
  verifier run. Do not dispatch the writer.
- When the operator asked for a rewrite, or Step 2a failed, keep the
  writer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the groom writer when the approved
  input is already a valid ticket.
- Groom: copy a verified source file instead of rewriting it.

## Impact

- `skills/groom/SKILL.md`
