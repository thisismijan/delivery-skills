## Why

Factory branches carry one commit per test, implementation, and review
round. When a human merges the change, those commits land on the default
branch one by one, so its history fills with work-in-progress steps
instead of one commit per change.

## What Changes

- Every GitLab merge request the factory opens is marked to squash on
  merge, through the executable adapter and through session tools.
- The execute skill and the conventions say a factory change always
  squashes on merge.
- GitHub has no per-pull-request squash flag. Its squash default stays a
  repository setting, which the GitHub provider notes name.
- Merging stays human-owned.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `forge-operations`: draft creation marks the change to squash on merge.

## Impact

- `providers/gitlab/gitlab-forge.ts`, `factory/scripts/mcp-catalogues.ts`
- `skills/execute/SKILL.md`, `factory/CONVENTIONS.md`,
  `providers/github/README.md`
