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
2. **Change is merged.** Write `{ "ref": "<ref>" }` and run
   `bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <read-input.json>`.
   Require normalized `state: "merged"`. Otherwise stop: "!<iid> is not
   merged".
3. **Default-branch pipeline passed.** Use normalized `revisions.merged`; if it
   is absent, stop because the merged revision cannot be identified. Follow
   `pipeline-monitoring.md` and query the normalized `pipeline` operation for
   that exact revision. Missing or running evidence waits without polling. A
   failed pipeline fixes forward only when attribution, frozen scope, and the
   bounded repair budget allow it; otherwise escalate. Do not verify or deploy
   a revision whose default-branch pipeline has not passed.
4. **The merge is deployed.** Use normalized `revisions.merged`; if it is
   absent, stop because the deployed revision cannot be identified. Confirm
   that the environment runs a version containing it. Evidence can be a version
   endpoint, an image tag, or the deploy job for that revision. If you cannot
   confirm it, stop: "cannot confirm <short sha> is deployed to <env>". Do not
   verify a version you cannot identify.

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
- Board: on a verified result only, move the ticket to the board's `done`
  column with `bun "${FACTORY_ROOT}/scripts/board-status.ts" sync "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key> done`.
  A skipped sync prints its reason; name it in the stage summary and continue. A non-zero exit is a provider failure: report it in plain words and continue. Never retry it or move the ticket any other way.
  A regressed or inconclusive result leaves the ticket where it is.
- Keys: status `[verified !N]` or `[regressed !N]`. An inconclusive result leaves
  `[merged !N]` and adds a Decision line naming the gaps.
- When every key in the epic is verified or stopped, recommend
  `/delivery retro <EPIC>`.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Not merged | !<iid> is not merged | `/delivery ship <iid>` |
| Default pipeline pending | Pipeline still running at <sha> | Event subscription, or `/delivery auto <KEY>` later |
| Default pipeline failed | Pipeline failed at <sha> | Follow `pipeline-monitoring.md` |
| Not deployed | Cannot confirm <sha> is deployed to <env> | `/delivery verify <iid>` after deploy |

## Never

- Roll back, deploy, restart, or change a flag.
- Close or reopen a ticket.
- Treat the open-change pipeline as default-branch evidence.
- Write to the environment without the operator's go-ahead.
- Treat a signal you could not read as healthy.
- Fix a regression in this session. It goes back through intake.
