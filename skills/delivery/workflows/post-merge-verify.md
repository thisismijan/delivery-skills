# Post-merge verify

Stage 5 of the delivery conductor. After a person merges and deploys a change,
this stage proves it works on the real running system. The factory's green gate
proves the tests pass; it does not prove the deployed service behaves.

It ends with verified, regressed, or inconclusive. It never rolls back, deploys,
or changes a flag.

## Inputs

- MR iid.
- The environment the operator says it is deployed to. If they did not say, ask
  once.

## Preconditions

1. **Ledger.** Find it (`delivery-ledger.md`). If the ledger has no readiness
   brief for this iid, continue and say in the result that there was no watch
   list to check against.
2. **MR is merged.** the forge change view for `<iid>`: `state` is `merged`.
   Otherwise stop: "!<iid> is not merged".
3. **The merge is deployed.** Find the merge commit (`merge_commit_sha`, or
   `squash_commit_sha` for a squash merge) and confirm that the environment runs
   a version containing it. Evidence can be a version endpoint, an image tag,
   or the deploy job for that commit. If you cannot confirm it, stop: "cannot
   confirm <short sha> is deployed to <env>". Do not verify a version you cannot
   identify.

## Steps

### 1. Drive the change

If the target repo has a verification skill (`verify-<app>` in its skills directory),
use it to exercise every feature the change touched against the environment.
Capture its evidence.

If it has none:

1. Take the acceptance criteria from the OpenSpec change, or the ticket if
   there is no change.
2. Exercise each one through the interfaces the environment exposes: API calls,
   UI steps, or CLI commands. Read-only where possible. Any step that writes to
   the environment needs the operator's go-ahead first.
3. Recommend creating a verification skill for this repo, so the next verify
   does not start from scratch.

### 2. Check the watch list

For each row in the readiness brief's watch list, check the signal at the end
of the watch window and compare it with the same signal before the deploy. Use
whatever observability tools are connected. A signal you cannot read is
recorded as unread, never as fine.

### 3. Decide

| Result | When |
|--------|------|
| **Verified** | Every touched feature behaved as specified, and no watched signal got worse |
| **Regressed** | A feature misbehaves, or a watched signal got worse |
| **Inconclusive** | Something could not be exercised or read, and nothing was found wrong |

On **regressed**:

- If the readiness brief's rollback trigger is met, write a rollback
  recommendation: the trigger and its reading, then the rollback steps copied
  from the brief. The operator decides and acts.
- Otherwise, write a bug report the operator can file: what broke, how to
  reproduce it, and evidence. Once it is filed, it enters the loop through
  `/delivery triage <KEY>`.

If rollback, forward repair, or containment are simultaneously viable, compare
them through `SKILL.md`'s **Human decision brief** before asking the operator.
The deployed evidence and readiness rollback trigger are known facts; do not
soften a met trigger into a preference.

On **inconclusive**, list exactly what could not be checked and what access
would close the gap.

### 4. Report

Follow the human-facing output rules.

```markdown
## Post-merge check: !<iid> <title> on <env>

**<Verified | Regressed | Inconclusive>** at deployed commit <short sha>.

### Behaviour
| Feature | What we did | Result | Evidence |

### Signals
| Signal | Before | After | Result |

### Next
<rollback recommendation, bug report, or the gaps to close>
```

## Ledger writes

- Verdicts: one `verify` row with the deployed commit and the result.
- Keys: status `[verified !N]` or `[regressed !N]`. An inconclusive result leaves
  `[merged !N]` and adds a Decision line naming the gaps.
- When every key in the epic is verified or stopped, recommend
  `/delivery retro <EPIC>`.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Not merged | !<iid> is not merged | `/delivery ship <iid>` |
| Not deployed | Cannot confirm <sha> is deployed to <env> | `/delivery verify <iid>` after deploy |

## Never

- Roll back, deploy, restart, or change a flag.
- Write to the environment without the operator's go-ahead.
- Treat a signal you could not read as healthy.
- Fix a regression in this session. It goes back through intake.
