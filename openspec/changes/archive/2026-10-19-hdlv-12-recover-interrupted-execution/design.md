## Context

`selectNextAction` in `factory/scripts/next-action.ts` reads the auto next-step table. The `[executing]` row says "Review once the MR exists; while the build runs, wait". The helper currently takes only args and status, so it cannot tell a live owner from a crash, or a matching open MR from none. HDLV-9 left that gap on purpose. Execute already has re-entry reconciliation in `skills/execute/SKILL.md`, but auto and a bare-key resume never reach it while they wait. Complexity signal: medium.

## Goals / Non-Goals

**Goals:**
- One pure recovery decision for `[executing]`, driven by owner, merge request, and attributable evidence.
- Resume records a matching open MR and selects review.
- Resume with no active owner and no MR stops and offers `/delivery execute <KEY>`.
- Unattributable branch, gate, or dirty-tree evidence escalates.

**Non-Goals:**
- Automatic retries after a confirmed failed stage.
- Changing that typing execute is the build approval.
- Replacing execute's own re-entry reconciliation; this helper decides whether resume waits, reviews, stops, or escalates. Execute still reconciles when the operator types execute.

## Decisions

### Approved test seams

Preference was given to extending `selectNextAction` and adding one recovery helper beside it. Both are pure functions, tested with `bun test`.

1. **`recoverExecuting(evidence)`** in `factory/scripts/execute-recovery.ts`.
   - Inputs are already-reconciled facts: ticket key, owner (`none` / `inactive` / `active` / `unknown`), merge request (`none` / `matching` with iid / `conflicting`), and optional branch, gate, and dirty-worktree evidence each marked present-and-attributed or present-and-unattributed.
   - Decision order is fail-closed: unattributable or conflicting evidence escalates; a matching open MR selects review and returns the iid; an active owner with no MR waits; an unknown owner with no MR escalates; no active owner and no MR is an interrupted stop that names `/delivery execute <KEY>`.
   - Catches: matching MR proceeds to review with the iid; no owner and no MR stops with the execute-resume command; live owner waits; unknown owner without an MR escalates; dirty, branch, or gate evidence that cannot be attributed escalates even when an MR exists; a confirmed failed status is not this helper's retry path.
   - Misses: whether the conductor actually wrote the iid or the stop into the ledger; whether execute's re-entry then reuses attributed dirty files. Those stay with the conductor and execute.
   - Controlled fakes: evidence objects built by the test. No network, git, process table, clock, or filesystem.

2. **`selectNextAction(input, writer?)`** (extends the current helper).
   - When the reconciled status is `[executing]`, it requires recovery evidence and uses `recoverExecuting`. A missing evidence object stops rather than guessing review or wait from the table wording.
   - A matching-MR recovery selects review as a single step and carries the iid so the conductor can record it. The helper still does not write the ledger.
   - An interrupted recovery: a bare key stops and offers the execute-resume command; an explicit `execute` runs only that step (the build approval); any other explicit lifecycle verb stops.
   - A wait recovery returns wait and never calls the writer. An escalate recovery returns escalate and never calls the writer.
   - Catches: `[executing]` no longer blindly selects review; explicit execute at interrupted `[executing]` is legal; explicit execute while a live owner still builds does not start a second run; illegal verbs still stop with the writer uncalled.
   - Misses: whether auto's prose follows the new table cell. Wording tests cover that.

**What the seams miss together:** live GitLab lookups and process liveness. The conductor still reconciles those facts before calling the helper, as HDLV-9 already requires.

### Auto table and execute-resume command

The `[executing]` next-step cell describes recovery instead of "wait while the build runs" as the only path. Keyword parsing of that cell is no longer the source of the `[executing]` action; the helper is. `/delivery execute <KEY>` is the safe resume command because typing execute remains the approval to build. A bare key must not start execute.

Failed `[stopped: …]` rows stay "Nothing. Never retry." Recovery of an interrupted execute is not a retry of a failed stage.

### Alternatives considered

- Treat every `[executing]` with no MR as interrupted: rejected, a live owner is still building.
- Auto-run execute from a bare key after a crash: rejected, typing execute is the build approval.
- Put attribution guesses in the helper (keep files that look like this change): rejected, the ticket forbids guessing.
- Reuse ledger lock recovery as the owner signal without an evidence object: rejected, execute's owner is not always the ledger lock, and tests would need a real process table.

## Risks / Trade-offs

- Existing `[executing]` table wording currently makes `selectNextAction` pick review. Tests that implied review-without-an-MR must fail until recovery evidence is required. Mitigation: add explicit matching-MR, interrupted, wait, and escalate cases rather than weakening the HDLV-9 resume tests.
- An operator could forge an `active` owner in a unit test. Mitigation: the helper only classifies supplied evidence; the conductor remains responsible for reconciling liveness, as with ledger lock recovery.
- Foreign-host or unreadable owner looks like "unknown", which escalates instead of waiting forever or restarting. That can bother a live remote session. Mitigation: matching open MR still proceeds to review; the unknown-owner path only applies when there is no MR.
