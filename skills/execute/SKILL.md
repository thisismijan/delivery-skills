---
name: execute
description: Phase 2 — implement an approved OpenSpec change test-first (red gate -> implement -> green gate), run the Opus holdout review, and ONLY on a satisfied review open a draft merge request for Stage 3. The factory never merges. Invoking this command IS the approval to build.
argument-hint: <JIRA-KEY>
disable-model-invocation: true
---

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
export `CLAUDE_PLUGIN_ROOT="$FACTORY_ROOT"` so existing gate scripts keep
working. Cursor has no plugin agent loader: when a step names a subagent, read
`$FACTORY_ROOT/agents/<name>.md` and follow it.


You are running **/execute** for Jira ticket **$ARGUMENTS**.

This command implements the approved change and, **only after the holdout review is satisfied**, opens the merge request. Follow the steps in order. Treat the gate scripts as ground truth — never substitute your own judgement for a gate's exit code.

## Hard rules

- **Tests first.** Write tests before implementation and prove they fail (red gate). Never modify tests to make them pass.
- **No pressure bypass.** Time pressure never permits skipping the red gate, green gate, holdout review, or operator-owned action.
- **Review before the MR.** The holdout review runs against the **committed branch diff + gate results** — there is no MR yet. **An MR is opened only after the review returns `approve`.** Never open an MR for un-reviewed, changes-requested, rejected, or escalated work.
- **Gated writes only:** the only writes are the branch commit/push, the MR (created post-approval), and comments (on the MR and Jira). **The factory NEVER merges or closes an MR, and never changes Jira status — humans own merge, close, and status.**
- **Fail closed:** no matching spec, more than one match, a gate that didn't run, or a gate failure with attempts exhausted → stop + escalate. Never open an MR on un-green code.
- **Mutation boundary.** Detect the host (`cursor` or `claude-code`; otherwise `unknown`). Run `canStartStage` before any write:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" execute <host>
  ```
  Non-zero exit → **stop**. Cursor is declared unenforced until a real mutation hook exists, so execute cannot start there. Do not proceed on an unenforced or unknown host.

## Steps

1. **Locate the change.** Run:
   ```
   bun "${FACTORY_ROOT}/scripts/find-change.ts" $ARGUMENTS openspec/changes
   ```
   Non-zero exit (no match, or `ambiguous` with more than one match) → **stop + escalate** (fail closed). Otherwise use the printed `match` as `<changeName>` (and `openspec/changes/<changeName>` as `<changeDir>`, also the branch name).

2. **Verify the spec (fail closed):**
   ```
   bun "${FACTORY_ROOT}/scripts/verify-change.ts" <changeDir>
   ```
   Non-zero exit → stop + escalate.

3. **Check out** the spec branch `<changeName>`, resolve `<repoRoot>` with `git rev-parse --show-toplevel`, then create `<reviewDir> = <repoRoot>/.review/<changeName>` (`mkdir -p` it). It holds append-only gate evidence and the diff; it is worktree-local scratch state and must be gitignored, never committed.

3a. **Re-entry reconciliation.** Before writing or changing anything, reconcile
the durable state from a prior interrupted run: the **existing MR**, existing
**test files**, persisted **gate artifacts**, branch **commits**, and the
**dirty worktree**. Bind reusable gate evidence to the exact test/source commit
and command it proved; stale or ambiguous evidence is not reusable.

- If an approved existing MR already points at the current branch head, report
  it and stop successfully. **Never open a duplicate MR.**
- Resume from the earliest incomplete gate. Never repeat a completed write,
  **never rewrite already-proven tests**, and never discard dirty work without
  identifying whether it belongs to this run.
- If state conflicts (for example, an MR exists for an unapproved head, a red
  artifact belongs to different tests, or commits cannot be attributed), stop
  and escalate rather than guessing.

4. **Write tests first.** Resolve `standard` against
   `.delivery/routing/model-inventory.json`, then dispatch the `test-writer`
   subagent with that exact available model, `<changeDir>/specs/`, and
   `<changeDir>/tasks.md`. It writes test files only. It writes **durable** tests
   and **skips** inherently transient (point-in-time migration) scenarios,
   reporting each skip with a reason (see "Test durability" in CLAUDE.md).
   **Capture its skip report** verbatim to `<reviewDir>/skips.md` (write an
   explicit "none" if it skipped nothing) - the holdout reviewer reads it in
   step 10 and the MR surfaces it in step 11.

5. **Red gate (enforced).** Write `<reviewDir>/red-command.json` containing an argv array (never a shell string), the repo cwd, every expected new test path, and a timeout. Run it and persist the JSON output under an append-only name containing the test commit:
   ```
   set -o pipefail
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command.json" red | tee "<reviewDir>/red-gate-<test-commit>.json"
   ```
   The gate's own exit code still governs the decision: non-zero exit → the tests passed before implementation (vacuous tests or a no-op) → **stop + escalate**. No MR.

6. **Select the implementation model.** Read the recorded feasibility decision — **do not re-judge complexity yourself** (the honest signal was set in `/draft` against the codebase; guessing it here defeats the point):
   ```
   bun "${FACTORY_ROOT}/scripts/change-meta.ts" read <changeDir>
   ```
   Use the `complexitySignal` and `opusJustification` (if any) from that JSON:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" implement <complexitySignal> "<opusJustification from the meta>"
   ```
   If the meta read exits non-zero (a change drafted before this file existed, or a corrupt file), **do not guess** — treat it as no defended case and use `sonnet` (PRD §9: absent a recorded, defended complexity case, Sonnet). Map `sonnet` to the `standard` capability and `opus` to `frontier`, then resolve that tier against `.delivery/routing/model-inventory.json`. The resolver's exact model identifier is the implementation worker. If the semantic selection prints `opus`, the recorded justification must appear in the MR description.

   **Profile then shadow-route implementation.** Resolve `frontier`, then dispatch the `task-profile-controller` subagent with that exact available model (tools: `Read, Grep, Glob` only) and a compact bundle of the spec, feasibility meta, and blast radius. Persist its JSON to `<reviewDir>/implement-profile.json` and validate it:
   ```
   bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/implement-profile.json"
   bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-shadow.json"
   ```
   Persist that JSON. **Dispatch still uses the live `select-model.ts`
   capability and the exact model returned by `model-catalogue.ts`.** A cheaper
   `shadowTier` is a recommendation for later evaluation, never this run's
   worker. After the red and green gates (or an escalation), persist the
   observation:
   ```
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-outcome.json" "<reviewDir>/implement-usage.json" <controller-model> <implementation-model>
   ```
   The outcome file records each gate result, repair count, and escalations.
   Do not omit it; persistence refuses a missing outcome.
   The usage file records token or character counts when available, otherwise
   `{ "source": "unavailable" }`. Persist both exact resolved model identifiers.
   Do not dispatch a catalogue fast model unless `fast-dispatch.ts` later
   reports that the exact candidate on reversible, strongly verified work has
   cleared the 90 percent bar.

7. **Implement to green.** Dispatch the `implementer` subagent using the exact
   runtime model resolved in step 6. Override the prompt's static model. If the
   host cannot override a plugin agent's model, use the existing
   `implementer-opus` fallback only for the semantic frontier case.

8. **Green gates.** Write `<reviewDir>/green-command.json` with argv, cwd, and all expected test paths. Run the full green gate, lint, and typecheck **in parallel**, persist each result under an append-only name containing the source commit, and wait for all three:
   ```
   set -o pipefail
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command.json" green | tee "<reviewDir>/green-gate-<source-commit>.json"
   ```
   If any of the three fail, dispatch the `implementer` again to fix the source (not the tests). Loop a small bounded number of times (the formal ceiling is N6), then **stop + escalate**.

   **Premise checkpoint:** after **two failures that share the same
   assumption**, **state the premise** and run **one discriminating observation**
   that could disprove it. There is **no third fix** before this check. If the
   observation does not identify a defensible next action within
   `maxFixAttempts`, stop and escalate.

9. **Self-review.** The `implementer` reviews its own diff against `specs/` and `tasks.md`, and marks `tasks.md` items done.

10. **Holdout review (before any MR exists).** The reviewer is read-only (tools: `Read, Grep, Glob` — no Bash/git/MCP), so **the command prepares its inputs as files**: write the branch diff against the default branch to a file (`git diff <default-branch>...HEAD > <reviewDir>/diff.patch`). Pass the complete set of append-only red, green, lint, and typecheck artifacts from steps 5 and 8. Do NOT re-run gates or roll back implementation to reconstruct evidence. Confirm the required capability: `bun "${FACTORY_ROOT}/scripts/select-model.ts" review` (→ semantic `opus`, therefore `frontier`), then resolve the exact available frontier model. Dispatch `task-profile-controller` with that frontier model, validate with `task-profile.ts`, then persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"`. After the verdict, persist the observation with an explicit outcome file, including the controller's exact model identifier:
   ```
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json" "<reviewDir>/review-usage.json" <frontier-model> <frontier-model>
   ```
   `review-outcome.json` records the holdout verdict's terminal result, repairs, and escalations. Do not omit it; persistence refuses a missing outcome. Dispatch the `holdout-reviewer` subagent with the same resolved frontier model and **only**: the Jira ticket, `<changeDir>` (the spec), the diff file, the test files, all gate-result files, and the **skip report** (`<reviewDir>/skips.md`). **Do not pass the implementer's reasoning or any prior chatter.** It returns a `ReviewVerdict` JSON. **No MR is opened at this point.**

11. **Route the verdict (deterministic).**
    ```
    bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
    ```
    `maxAttempts` comes from `bun "${FACTORY_ROOT}/scripts/config.ts"` (`maxFixAttempts`, default 2); `attempt` starts at 1 and increments each fix loop. **Non-zero exit = malformed verdict → stop + escalate** (fail closed). Then act on `action`:
    - **`approve`** → **now open a draft MR.** Push the branch (`git push -u origin <changeName>`) and create it with `glab mr create --draft`, targeting the default branch. Stage 3 review, not execute, marks it ready. **Build the MR title with the title helper so it always opens with the Jira reference** (Rule 3):
      ```
      bun "${FACTORY_ROOT}/scripts/mr-title.ts" $ARGUMENTS "<ticket summary>"
      ```
      (yields e.g. `SMAI-123 - Add new fireworks feature`.) The MR description carries `Closes`, the spec link, a short human-readable paragraph explaining what the change does and how, and any Opus justification — write it like a person would (no field-name dumps, no em dashes; see the human-output rules in CLAUDE.md). If `<reviewDir>/skips.md` lists any skipped scenarios, **surface them in the description** as a short plain-language note ("The following acceptance points were verified as part of this change but intentionally not given a permanent test, because they only describe the migration moment: ..."), so the human sees what was deliberately left untested and why. Never drop skips silently. Render the holdout outcome for the MR note and the Jira comment with the summary helper (Rule 2 — never paste raw verdict fields):
      ```
      bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'
      ```
      Post that summary as an MR note **and** a Jira comment (via `scripts/audit.ts`) with the MR link, stating the review passed and that a human performs the merge. Write the note body under `.review/`, then run the publication check and `gl-note` (do not bypass with `glab api` or `glab mr note`):
      ```
      bun "${FACTORY_ROOT}/scripts/note-publication.ts" check <file> <repoRoot>
      gl-note <iid> --file <file>
      ```
      This posts an individual note that never counts as an unresolved thread blocking the human's merge. **STOP at APPROVED.** Do **not** run `glab mr merge`. Do **not** run `/openspec-archive` (it folds the spec into `openspec/specs/` and only makes sense after the human's merge — leave it to a post-merge step).
    - **`fix`** → dispatch the `implementer` subagent to address the verdict `findings`, re-run the **green gate** (step 8), increment `attempt`, and **go back to step 10** (re-review runs fresh — it does not see the fixer's reasoning). **No MR is created during the fix loop.** If two failed fixes share the same assumption, apply the premise checkpoint from step 8 before any third fix.
    - **`escalate`** → push the branch (`git push -u origin <changeName>`) so a human can inspect the work, post the `reason` (and any `findings`) as a Jira comment, and stop (NEEDS_HUMAN). **Do not open an MR** — the review did not pass; the human decides what happens next.

12. **Invariants.** An MR exists **only** for review-approved work. The factory **creates and approves MRs but NEVER merges, archives, or closes them** — humans own merge, close, and the post-merge archive. The reviewer never sees implementer reasoning; the factory never changes Jira status.
