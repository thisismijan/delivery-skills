## Why

`/draft` still starts a feasibility-analyst when the ticket already names
authentication, secrets, or a data migration in what to build or the
acceptance criteria. The analyst's own rule is to escalate those. A
script can write that verdict without a model.

## What Changes

- After a good assessment, scan those two sections for those terms.
- On a hit, write a `needs_human` feasibility verdict and do not
  dispatch the analyst.
- Ordinary tickets still use one analyst.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the feasibility-analyst on named
  safety-sensitive work.

## Impact

- `factory/scripts/ticket-feasibility.ts`
- `skills/draft/SKILL.md`
- `factory/agents/feasibility-analyst.md`
