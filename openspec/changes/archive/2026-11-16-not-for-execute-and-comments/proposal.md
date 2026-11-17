## Why

DS-3 gave `/groom` and `/draft` a start clause and a not-for clause, and left
`/execute` and `/address-comments` out on purpose. Those two are the most
expensive to start by mistake: invoking `/execute` authorizes a build, starts
workers, and writes a branch, and `/address-comments` changes code and replies
on threads. A host that matched either description on a plain question could
start that work.

## What Changes

- The `/execute` and `/address-comments` descriptions each gain a "Use when"
  clause (the operator asks for the work, types the command, or the conductor
  dispatches the stage) and a "Not for" clause (a question that needs only an
  answer).
- The skill metadata check's covered list grows from groom and draft to the four
  stage skills that write or build, so it fails and names either skill if its
  not-for clause is lost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-skill-triggers`: the not-for rule covers `/execute` and
  `/address-comments`.

## Impact

- `skills/execute/SKILL.md`, `skills/address-comments/SKILL.md`
- `factory/scripts/skill-metadata.ts` and its test
- `factory/scripts/workflow-contracts.test.ts`
