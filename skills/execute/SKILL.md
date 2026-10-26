---
name: execute
description: Phase 2 — implement an approved OpenSpec change test-first (red gate -> implement -> green gate), run the Opus holdout review, and ONLY on a satisfied review open a draft merge request for Stage 3. The factory never merges. Invoking this command or a recorded continuous-delivery run authorizes the build.
---

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
Export `FACTORY_ROOT` as that file describes. When a step names a subagent, read
`$FACTORY_ROOT/agents/<name>.md` and follow it. Do not invent a cheaper substitute prompt.
Load the SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill).
It outranks this skill. Verify with
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" preflight`.
If `.delivery/runs/<id>.run-contract.json` exists, or the ledger records
`continuous-delivery: yes`, check it before mutating:
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" check <run-contract.json> execute <work-item-key>`.
Non-zero exit is a terminal stop. Do not add scope the frozen plan does not name.


You are running **/execute** for the work item named in the skill arguments (`<work-item-key>`).

This command implements the approved change and, **only after the holdout review is satisfied**, opens the merge request. Follow the steps in order. Treat the gate scripts as ground truth — never substitute your own judgement for a gate's exit code.

## Hard rules

- **Tests first.** Write tests before implementation and prove they fail (red gate). Never modify tests to make them pass.
- **No pressure bypass.** Time pressure never permits skipping the red gate, green gate, holdout review, or operator-owned action.
- **Review before the MR.** The holdout review runs against the **committed branch diff + gate results** — there is no MR yet. **An MR is opened only after the review returns `approve`.** Never open an MR for un-reviewed, changes-requested, rejected, or escalated work.
- **Open the change as soon as the first holdout review is satisfied, then check back on it.** The first `approve` opens the draft change in the same step; never hold it back for extra local review rounds. Reviewers, people or automated, often comment only once a change is posted. Release readiness reads those comments before the change is reported ready, and any unanswered one is answered in one `/address-comments` round.
- **Gated writes only:** the only writes are the branch commit/push, the change (created post-approval), and notes (on the change and the selected work item). **The factory NEVER merges, closes, or resolves threads, and never changes work-item status; humans own merge, close, thread resolution, and status.**
- **Fail closed:** no matching spec, more than one match, a gate that didn't run, or a gate failure with attempts exhausted → stop + escalate. Never open an MR on un-green code.
- **Mutation boundary.** Run `canStartStage` before any write, using the runtime's mutation-guard identifier:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" execute "${FACTORY_ROOT}/runtime-manifest.json"
  ```
  Non-zero exit → **stop**. A runtime that does not declare an enforceable mutation boundary cannot start this mutating stage. Do not proceed when mutation boundaries are unenforced or unknown.
- **Confirmed provider.** Before reading or writing a work-item note, run
  `bun "${FACTORY_ROOT}/scripts/work-item-config.ts" check "$(git rev-parse --show-toplevel)" "${FACTORY_ROOT}/runtime-manifest.json"`.
  Missing or stale selection stops with `/delivery init`; never infer one.

## Steps

1. **Locate the change.** Run:
   ```
   bun "${FACTORY_ROOT}/scripts/find-change.ts" <work-item-key> openspec/changes
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

Before reusing a persisted red or green gate artifact, verify it is still
bound to the current commit, command, and test file contents. The script
calls verifyGateEvidence:
```
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/red-gate-<test-commit>.json" "<reviewDir>/red-command.json"
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/green-gate-<source-commit>.json" "<reviewDir>/green-command.json"
```
Non-zero exit means the evidence is stale or the command or tests changed —
re-run the gate. Do not reuse it.

- Find any open change for this source branch with the exact forge command.
  Write `{ "sourceBranch": "<changeName>" }` to `<reviewDir>/find-input.json`,
  then:
  ```
  bun "${FACTORY_ROOT}/scripts/forge-provider.ts" find "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/find-input.json"
  ```
  Non-zero exit → **stop + escalate** (fail closed). If an open change already
  points at the current branch head, report that change ref and stop
  successfully. **Never open a duplicate MR.**
- Resume from the earliest incomplete gate. Never repeat a completed write,
  **never rewrite already-proven tests**, and never discard dirty work without
  identifying whether it belongs to this run.
- If state conflicts (for example, an MR exists for an unapproved head, a red
  artifact belongs to different tests, or commits cannot be attributed), stop
  and escalate rather than guessing. Never discard unattributable dirty work,
  a stale branch, or stale gate evidence.
- `/delivery execute <KEY>` after an interrupted single-step stop is the safe
  resume, and typing execute is its approval to build. A run whose shared
  ledger records `continuous-delivery: yes` resumes from `/delivery auto
  <KEY>` without another checkbox. Do not start execute from an unapproved
  bare-key resume.

4. **Write tests first.** Resolve `standard` against
   `.delivery/routing/model-inventory.json`, then dispatch the `test-writer`
   subagent with that exact available model, `<changeDir>/specs/`, and
   `<changeDir>/tasks.md`, bundled with the work item into one file by
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec <changeDir> --out <reviewDir>/test-packet.md`
   and given to it as its starting input. It writes test files only. It writes **durable** tests
   and **skips** inherently transient (point-in-time migration) scenarios,
   reporting each skip with a reason (see "Test durability" in `CONVENTIONS.md`).
   Capture its complete compact handoff verbatim to
   `<reviewDir>/test-writer-handoff.md`. Extract the `Skipped` section without
   rewriting it to `<reviewDir>/skips.md` (write an explicit `none` if it
   skipped nothing). The holdout reviewer reads only the skip artifact in step
   10; it never receives the worker's reasoning or complete handoff. The MR
   surfaces skips and any material `Not checked` or `Residual risks` items in
   step 11. Gate artifacts, not worker claims, remain authoritative.

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
   Use the `complexitySignal` and `frontierJustification` (if any) from that JSON:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" implement <complexitySignal> "<frontierJustification from the meta>"
   ```
   If the meta read exits non-zero (a change drafted before this file existed, or a corrupt file), **do not guess** — treat it as no defended case and use `sonnet` (PRD §9: absent a recorded, defended complexity case, Sonnet). Map `sonnet` to the `standard` capability and `opus` to `frontier`, then resolve that tier against `.delivery/routing/model-inventory.json`. The resolver's exact model identifier is the implementation worker. If the semantic selection prints `opus`, the recorded justification must appear in the MR description.

   **Optionally profile and shadow-route implementation.** Read
   `routingProfiling` from
   `bun "${FACTORY_ROOT}/scripts/config.ts"` (default `off`). Only when it is
   exactly `always`, resolve `frontier`, then dispatch the
   `task-profile-controller` subagent with that exact available model (tools:
   `Read, Grep, Glob` only) and a compact bundle of the spec, feasibility meta,
   and blast radius. Persist its JSON to
   `<reviewDir>/implement-profile.json` and validate it:
   ```
   bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/implement-profile.json"
   bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-shadow.json"
   ```
   In `always` mode, persist that JSON. **Dispatch still uses the live `select-model.ts`
   capability and the exact model returned by `model-catalogue.ts`.** A cheaper
   `shadowTier` is a recommendation for later evaluation, never this run's
   worker. Start a usage timer before the implementer runs:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/implement-usage-timer.json"
   ```
   After the red and green gates (or an escalation), write the outcome file,
   then finish capture. Pass `--host "<reviewDir>/host-usage.json"` only when
   the runtime wrote that file. Always pass the named artifacts:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/implement-usage-timer.json" "<reviewDir>/implement-usage.json" --input "<reviewDir>/implement-profile.json" --output "<reviewDir>/implement-outcome.json"
   ```
   Then persist the observation:
   ```
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-outcome.json" "<reviewDir>/implement-usage.json" <controller-model> <implementation-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   The outcome file records each gate result, repair count, and escalations.
   Do not omit it; persistence refuses a missing outcome. The usage file comes
   from `capture-usage.ts`. It always records wall time, uses host tokens and
   cost when present, and otherwise records character counts of those
   artifacts. Never write `{ "source": "unavailable" }` by hand.
   Persist both exact resolved model identifiers. When `routingProfiling` is
   `off`, skip this entire profiling, usage-capture, routing-persistence, and
   scorecard block and dispatch the same implementation worker directly. This
   setting only removes diagnostic work; it never changes the live model or
   weakens a quality gate.
   Do not dispatch a catalogue fast model unless `fast-dispatch.ts` later
   reports that the exact candidate on representative-run reversible, strongly
   verified work has cleared the 90 percent bar. Named safety floors still
   block auth, migration, concurrency, distributed-state, weak-verification,
   and holdout tasks. Do not treat a cleared bar, a public ranking, or an
   unscored fixture as live availability. That change needs an exact operator
   promotion approval naming the candidate.

7. **Implement to green.** Bundle the work item, the change's spec files, the
   failing tests and the red gate into one file:
   `git diff <default-branch>...HEAD > <reviewDir>/implement-diff.patch`, then
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/implement-diff.patch --evidence <red-gate-artifact> --out <reviewDir>/implement-packet.md`.
   Rebuild it before every fix dispatch, with the failing gate artifact or the
   review findings as the evidence.
   If this dispatch is a bounded rename, import-only, or format-only unit,
   write `<reviewDir>/mechanical-edit.json` and classify it:
   ```
   bun "${FACTORY_ROOT}/scripts/mechanical-edit.ts" "<reviewDir>/mechanical-edit.json"
   ```
   Incomplete or free-text findings are not a unit. Persist the JSON plan.
   When `apply` is `script`, use that scripted apply and skip the implementer
   for this unit. When the verdict is `not-mechanical` or there is no unit,
   keep the model from step 6. Do not ask the implementer whether the work is
   menial. Do not dispatch a catalogue fast model.
   Dispatch the `implementer` subagent with the
   packet as its starting input, using the exact
   runtime model resolved in step 6. Override the prompt's static model. If the
   host cannot override a plugin agent's model, use the existing
   `implementer-opus` fallback only for the semantic frontier case. Capture its
   complete compact handoff verbatim to
   `<reviewDir>/implementer-handoff.md`. This is an audit and human-summary
   input only: never pass it, the implementer's plan, or implementation
   reasoning to the holdout reviewer. Actual gate results remain authoritative.

8. **Green gates.** Write `<reviewDir>/green-command.json` with argv, cwd, and all expected test paths. Run the full green gate, lint, and typecheck **in parallel**, persist each result under an append-only name containing the source commit, and wait for all three:
   ```
   set -o pipefail
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command.json" green | tee "<reviewDir>/green-gate-<source-commit>.json"
   ```
   If any of the three fail, dispatch the `implementer` again to fix the source (not the tests). Loop a small bounded number of times (the formal ceiling is N6), then **stop + escalate**.

   When the implementer's handoff lists a failing test under **Test contradicts spec**, do not dispatch the implementer for that test. Dispatch the `test-writer` once with the work item, the spec scenario, and that line, to correct only the named test to the spec's contract. It never removes or loosens any other assertion. Then re-run the green gate. The holdout review still checks every test against the spec. A second contradiction on the same test stops and escalates.

   **Premise checkpoint:** after **two failures that share the same
   assumption**, **state the premise** and run **one discriminating observation**
   that could disprove it. There is **no third fix** before this check. If the
   observation does not identify a defensible next action within
   `maxFixAttempts`, stop and escalate.

9. **Reconcile implementation state without another model call.** Use the
   implementer's existing handoff and the successful green, lint, and typecheck
   artifacts to check the diff against `specs/` and `tasks.md`, then mark only
   the proven `tasks.md` items done. Do not dispatch the implementer or another
   subagent for this bookkeeping step. A missing or ambiguous proof remains
   unchecked and escalates rather than being inferred.

10. **Holdout review (before any MR exists).** The reviewer is read-only (tools: `Read, Grep, Glob` — no Bash/git/MCP), so **the command prepares its inputs as files**: write the branch diff against the default branch to a file (`git diff <default-branch>...HEAD > <reviewDir>/diff.patch`). Pass the complete set of append-only red, green, lint, and typecheck artifacts from steps 5 and 8. Bundle them with the work item, the change's spec files, and the complete diff into one file with `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/diff.patch --evidence <artifact>... --out <reviewDir>/review-packet.md` and give the reviewer that packet as its starting input; the separate files stay available to it. Do NOT re-run gates or roll back implementation to reconstruct evidence. Confirm the required capability: `bun "${FACTORY_ROOT}/scripts/select-model.ts" review` (→ semantic `opus`, therefore `frontier`), then resolve the exact available frontier model. When `routingProfiling` is exactly `always`, dispatch `task-profile-controller` with that frontier model, validate with `task-profile.ts`, then persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"`. In that mode, start a usage timer before the holdout reviewer:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/review-usage-timer.json"
   ```
   After the verdict, write the outcome file, finish capture, then persist the observation with the controller's exact model identifier. Pass `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that file:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/review-usage-timer.json" "<reviewDir>/review-usage.json" --input "<reviewDir>/review-profile.json" --output "<reviewDir>/review-outcome.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json" "<reviewDir>/review-usage.json" <frontier-model> <frontier-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   In `always` mode, refresh the run scorecard after each persisted task. It reports measured
   live usage and outcomes, but labels shadow quality and savings unevaluated
   until a paired benchmark exists. `review-outcome.json` records the holdout
   verdict's terminal result, repairs, and escalations. Do not omit it;
   persistence refuses a missing outcome. Never write
   `{ "source": "unavailable" }` by hand. When `routingProfiling` is `off`,
   skip the profile, usage-capture, routing-persistence, and scorecard commands.
   Regardless of this setting, dispatch the `holdout-reviewer`
   subagent with the same resolved frontier model and **only**: the work item,
   `<changeDir>` (the spec), the diff file, the test files, all gate-result
   files, and the **skip report** (`<reviewDir>/skips.md`). **Do not pass the
   implementer's reasoning or any prior chatter.** It returns a `ReviewVerdict`
   JSON. **No MR is opened at this point.**

11. **Route the verdict (deterministic).**
    ```
    bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
    ```
    `maxAttempts` comes from `bun "${FACTORY_ROOT}/scripts/config.ts"` (`maxFixAttempts`, default 2); `attempt` starts at 1 and increments each fix loop. **Non-zero exit = malformed verdict → stop + escalate** (fail closed). Then act on `action`:
    - **`approve`** → **now open a draft change**, immediately, with no further local review round first (see the hard rule on opening early and checking back). Push the branch (`git push -u origin <changeName>`). **Build the title with the title helper so it always opens with the work-item reference** (Rule 3):
      ```
      bun "${FACTORY_ROOT}/scripts/mr-title.ts" <work-item-key> "<ticket summary>"
      ```
      (yields e.g. `SMAI-123 - Add new fireworks feature`.) The description carries `Closes`, the spec link, a short human-readable paragraph explaining what the change does and how, and any frontier justification — write it like a person would (no field-name dumps, no em dashes; see the human-output rules in `CONVENTIONS.md`). Read the compact test-writer and implementer handoffs. Surface every material `Skipped`, `Not checked`, or `Residual risks` item in plain human language, but do not paste internal headings, raw worker output, or reasoning. If `<reviewDir>/skips.md` lists any skipped scenarios, **surface them in the description** as a short plain-language note ("The following acceptance points were verified as part of this change but intentionally not given a permanent test, because they only describe the migration moment: ..."), so the human sees what was deliberately left untested and why. Never drop skips or unresolved risks silently. Do not repeat a worker's claimed gate result; use only the persisted gate artifacts. Write `{ "approved": true, "draft": true, "sourceBranch": "<changeName>", "targetBranch": "<default-branch>", "title": "<title>", "description": "<description>" }` to `<reviewDir>/create-input.json`, then create the draft change with the exact forge command:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" create "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/create-input.json"
      ```
      Non-zero exit → **stop + escalate** (fail closed). Record the returned change `ref` (a user-facing MR iid is an alias for that ref). Stage 3 review, not execute, marks it ready. Render the holdout outcome for the change note and the tracker comment with the summary helper (Rule 2 — never paste raw verdict fields):
      ```
      bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'
      ```
      Post that summary as a change note **and** one selected-provider note (via `scripts/audit.ts`) with the change URL, stating the review passed and that a human performs the merge. Publish the work-item note only through `work-item-provider.ts note <repoRoot> "${FACTORY_ROOT}/runtime-manifest.json" <note.json>`. Write the forge note body under `.review/`. Write `{ "approved": true, "ref": "<change-ref>", "bodyPath": "<file>" }` to `<reviewDir>/note-input.json`, then:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" note "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/note-input.json"
      ```
      Do not bypass with a provider-native helper or a raw forge API. The command checks the body before any adapter; a refused body is a terminal stop. This posts an individual note that never counts as an unresolved thread blocking the human's merge. **STOP at APPROVED.** Do **not** merge, close, or resolve threads. Do **not** run `/openspec-archive` (it folds the spec into `openspec/specs/` and only makes sense after the human's merge — leave it to a post-merge step).
    - **`fix`** → dispatch the `implementer` subagent to address the verdict `findings`, re-run the **green gate** (step 8), increment `attempt`, and **go back to step 10** (re-review runs fresh — it does not see the fixer's reasoning). **No MR is created during the fix loop.** If two failed fixes share the same assumption, apply the premise checkpoint from step 8 before any third fix.
    - **`escalate`** → push the branch (`git push -u origin <changeName>`) so a human can inspect the work, post the `reason` (and any `findings`) as a selected-provider note, and stop (NEEDS_HUMAN). **Do not open an MR**; the review did not pass and the human decides what happens next.

12. **Invariants.** A change exists **only** for review-approved work. The factory **creates draft changes but NEVER merges, archives, closes, or resolves threads**; humans own merge, close, thread resolution, and the post-merge archive. The reviewer never sees implementer reasoning; the factory never changes work-item status. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
