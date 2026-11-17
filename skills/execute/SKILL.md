---
name: execute
description: Phase 2 — implement an approved OpenSpec change test-first (red gate -> implement -> green gate), run the Opus holdout review, and ONLY on a satisfied review open a draft merge request for Stage 3. The factory never merges. Invoking this command or a recorded continuous-delivery run authorizes the build. Use when the operator asks to build an approved change or types /execute, or the delivery conductor dispatches this stage. Not for a question about a change, a spec, or a review, or any other request that needs only an answer.
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

It builds the approved change, and the merge request opens **only once the holdout review is satisfied**. Take the steps in sequence. A gate's exit code decides; your own reading never overrides it.

## Hard rules for this stage

- **Tests first.** Write tests before implementation and prove they fail (red gate), except when `apply-mechanical-edit.ts` reports `apply` is `script`. Then the existing suite plus green, lint, and typecheck is the proof. Never modify tests to make them pass. Never skip holdout.
- **No pressure bypass.** Time pressure never permits skipping the red gate (except a scripted mechanical-edit unit), the green gate, holdout review, or operator-owned action.
- **Review comes first, then the MR.** With no MR in existence yet, the holdout reviewer judges the **committed branch diff and the gate results**. **The MR opens only after the review says `approve`.** Work that is unreviewed, sent back for changes, rejected, or escalated never gets an MR.
- **Open the change as soon as the first holdout review is satisfied, then check back on it.** The first `approve` opens the draft change in the same step; never hold it back for extra local review rounds. Reviewers, people or automated, often comment only once a change is posted. Release readiness reads those comments before the change is reported ready, and any unanswered one is answered in one `/address-comments` round.
- **Gated writes only:** the only writes are the branch commit/push, the change (created post-approval), and notes (on the change and the selected work item). **The factory NEVER merges, closes, or resolves threads.** It moves the ticket only forward, only through `board-status.ts sync`; humans own merge, close, thread resolution, and any other status change.
- **Fail closed:** a missing spec, several matching specs, a gate that never ran, or a gate still red once attempts run out all mean stop + escalate. Code that is not green never gets an MR.
- **Mutation boundary.** Run `canStartStage` before any write, using the runtime's mutation-guard identifier:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" execute "${FACTORY_ROOT}/runtime-manifest.json"
  ```
  Non-zero exit → **stop**. A runtime that does not declare an enforceable mutation boundary cannot start this mutating stage. Do not proceed when mutation boundaries are unenforced or unknown.
- **Confirmed provider.** Before reading or writing a work-item note, run
  `bun "${FACTORY_ROOT}/scripts/work-item-config.ts" check "$(git rev-parse --show-toplevel)" "${FACTORY_ROOT}/runtime-manifest.json"`.
  Missing or stale selection stops with `/delivery init`; never infer one.

## Steps, in order

1. **Locate the change.** Run
   `bun "${FACTORY_ROOT}/scripts/find-change.ts" <work-item-key> openspec/changes`.
   A non-zero exit (no match, or `ambiguous`) is a fail-closed **stop + escalate**. Otherwise the printed `match` is `<changeName>`, also the branch name, and `openspec/changes/<changeName>` is `<changeDir>`.

2. **Verify the spec, failing closed.** Run
   `bun "${FACTORY_ROOT}/scripts/verify-change.ts" <changeDir>`;
   any non-zero exit is a stop + escalate.

2a. **Red zones.** Run
   `bun "${FACTORY_ROOT}/scripts/risk-zones.ts" check <repoRoot> <changeDir> [ledger]`
   with the run ledger when there is one; an auto worker finds it beside its
   journal. With no owner-drawn `.delivery/zones` map it exits 0 and changes
   nothing. Exit 3 means the planned paths reach a red zone, or name no path
   while a red zone exists, and no person approved it: **stop** and name the
   zones. Only a person's own words recorded as an Approvals line naming
   `red-zone <changeName>` let it pass; `continuous-delivery: yes` and invoking
   this command do not. Exit 1 (an unreadable map) → stop + escalate.

3. **Check out** the spec branch `<changeName>`, resolve `<repoRoot>` with `git rev-parse --show-toplevel`, then create `<reviewDir> = <repoRoot>/.review/<changeName>` (`mkdir -p` it). It holds append-only gate evidence and the diff; it is worktree-local scratch state and must be gitignored, never committed. Then move the ticket to the board's `in-progress` column:
   ```
   bun "${FACTORY_ROOT}/scripts/board-status.ts" sync "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key> in-progress
   ```
   A skipped sync prints its reason; name it in the stage summary and continue. A non-zero exit is a provider failure: report it in plain words and continue. Never retry it or move the ticket any other way.

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

3b. **Scripted mechanical-edit first.** If this change is a bounded rename,
   import-only, or format-only unit, write `<reviewDir>/mechanical-edit.json`
   and apply it before any test-writer:
   ```
   bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit.json" "<repoRoot>"
   ```
   Incomplete or free-text findings are not a unit. Persist the JSON plan.
   The units the helper can prove, by language, are listed in
   `$FACTORY_ROOT/reference/mechanical-edit.md`; the helper's verdict decides.
   When `apply` is `script`, the helper
   already wrote the files. Do not dispatch the `test-writer` or the
   `implementer`. Do not run a red gate. Write
   `<reviewDir>/skipped-workers.json` naming those two workers and persist
   even when `routingProfiling` is `off`:
   ```
   bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/skipped-workers.json"
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   The scorecard counts avoided workers. It never estimates tokens saved.
   Write `none` to
   `<reviewDir>/test-writer-handoff.md`, `<reviewDir>/implementer-handoff.md`,
   and `<reviewDir>/skips.md`. Continue at the green gates. When the verdict
   is `not-mechanical`, apply is `select-model`, or there is no unit, keep
   tests-first below. Do not ask the implementer whether the work is menial.
   Do not dispatch a catalogue fast model. A payload flag is not proof that a
   script ran.

3c. **Characterization pass.** Run
   `bun "${FACTORY_ROOT}/scripts/characterize.ts" check <repoRoot> <changeDir>`.
   Exit 0 means every existing source file the plan names is already referenced
   by a test and none sits in a yellow zone: no pass runs. Exit 3 lists
   `pinned` files, each with its reason (no test references it, or yellow
   zone): before step 4, dispatch the `test-writer` in characterization mode
   with those files and the code map. It pins what they do today. Run its tests with
   `bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/characterize-command.json" green`,
   persisting the output as `<reviewDir>/characterize-gate-<commit>.json`;
   they must pass on the current code. Commit them alone as
   `test: characterize current behaviour` before the change's tests, and keep
   them out of the red gate. A failing run stops + escalates. Exit 1 → stop.

4. **Write tests first.** Resolve `standard` against
   `.delivery/routing/model-inventory.json`, then dispatch the `test-writer`
   subagent with that exact available model, `<changeDir>/specs/`, and
   `<changeDir>/tasks.md`, bundled with the work item and a code map into one
   file given to it as its starting input. Build the map of what the affected
   areas already export with
   `bun "${FACTORY_ROOT}/scripts/code-map.ts" "<repoRoot>" <changeDir> > "<reviewDir>/code-map.md"`
   (non-zero exit → stop and escalate), then the packet with
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec <changeDir> --context <reviewDir>/code-map.md --out <reviewDir>/test-packet.md`.
   When `<changeDir>/comprehension.md` exists, add `--context <changeDir>/comprehension.md` to this packet and to the implementer's packet in step 7, so both workers start from what feasibility learned. It writes test files only. It writes **durable** tests
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
   set -o pipefail  # tee must not mask the gate's exit code
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command.json" red | tee "<reviewDir>/red-gate-<test-commit>.json"
   ```
   Only that exit code decides. Non-zero means the new tests passed with no implementation (they test nothing, or the change is a no-op): **stop + escalate**, no MR.

6. **Select the implementation model.** `/draft` judged complexity against the codebase; **never judge it again here**, since a guess wastes that signal. Read it with
   `bun "${FACTORY_ROOT}/scripts/change-meta.ts" read <changeDir>`,
   then feed its `complexitySignal`, plus its `frontierJustification` when present, to:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" implement <complexitySignal> "<frontierJustification from the meta>"
   ```
   If the meta read exits non-zero (a change drafted before this file existed, or a corrupt file), **do not guess** — treat it as no defended case and use `sonnet` (PRD §9: absent a recorded, defended complexity case, Sonnet). Map `sonnet` to the `standard` capability and `opus` to `frontier`, then resolve that tier against `.delivery/routing/model-inventory.json`. The resolver's exact model identifier is the implementation worker. If the semantic selection prints `opus`, the recorded justification must appear in the MR description. At the `max` level `select-model.ts` prints `opus` for every implementation; the justification is then the run's level, and the MR description says so.

   **Routing profiling.** Read `routingProfiling` from
   `bun "${FACTORY_ROOT}/scripts/config.ts"` (default `off`). Only when it is
   exactly `always`, follow **Implementation** in
   `$FACTORY_ROOT/reference/routing-profiling.md` around the implementer. When
   it is `off`, dispatch the same implementation worker directly. Either way,
   persist scripted skips with `record-skip.ts` and refresh the scorecard after
   them. Profiling never changes the live model or weakens a quality gate.
   Do not dispatch a catalogue fast model unless it is live. Its promotion
   rules and safety floors are in `$FACTORY_ROOT/reference/fast-models.md`.

7. **Implement to green.** Bundle the work item, the change's spec files, the
   failing tests and the red gate into one file:
   `git diff <default-branch>...HEAD > <reviewDir>/implement-diff.patch`, then
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/implement-diff.patch --evidence <red-gate-artifact> --context <reviewDir>/code-map.md --out <reviewDir>/implement-packet.md`.
   Rebuild it before every fix dispatch, with the failing gate artifact or the
   review findings as the evidence.
   If this dispatch is a bounded rename, import-only, or format-only unit,
   write `<reviewDir>/mechanical-edit.json` and apply it:
   ```
   bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit.json" "<repoRoot>"
   ```
   Incomplete or free-text findings are not a unit. Persist the JSON plan.
   The units it proves are listed in `$FACTORY_ROOT/reference/mechanical-edit.md`.
   When `apply` is `script`, the helper
   already wrote the files. Do not dispatch the `implementer`. Write
   `<reviewDir>/skipped-workers.json` naming `implementer` and persist with
   `record-skip.ts`, then refresh `routing-scorecard.ts`, even when
   `routingProfiling` is `off`. The scorecard counts avoided workers. It never
   estimates tokens saved. Write `none`
   to `<reviewDir>/implementer-handoff.md` if it is empty, and continue at
   the green gates (step 8). When the verdict is `not-mechanical`, apply is
   `select-model`, or there is no unit, keep the model from step 6. Do not
   ask the implementer whether the work is menial. Do not dispatch a catalogue
   fast model. A payload flag is not proof that a script ran.
   Otherwise dispatch the `implementer` subagent with the
   packet as its starting input, using the exact
   runtime model resolved in step 6. Override the prompt's static model. If the
   host cannot override a plugin agent's model, use the existing
   `implementer-opus` fallback only for the semantic frontier case. Capture its
   complete compact handoff verbatim to
   `<reviewDir>/implementer-handoff.md`. This is an audit and human-summary
   input only: never pass it, the implementer's plan, or implementation
   reasoning to the holdout reviewer. Actual gate results remain authoritative.

8. **Green gates.** Before each commit in this stage, the test commit and
   every source commit, run the repository's formatter in fix mode on the files
   that commit changes (the one the lint gate checks, for example
   `biome check --write`, `prettier --write`, `ruff format`, or `gofmt -w`) so
   formatting is never a commit of its own. When lint fails only on
   formatting, run the formatter, amend that unpushed source commit, and re-run
   the gates. A fix that changes behaviour the spec describes updates
   `<changeDir>` in the same commit. Write `<reviewDir>/green-command.json` with argv, cwd, and all expected test paths. Run the full green gate, lint, and typecheck **in parallel**, persist each result under an append-only name containing the source commit, and wait for all three:
   ```
   set -o pipefail  # likewise
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command.json" green | tee "<reviewDir>/green-gate-<source-commit>.json"
   ```
   If any of the three fail, dispatch the `implementer` again to fix the source (not the tests). Loop a small bounded number of times (the formal ceiling is N6), then **stop + escalate**.

   When the implementer's handoff lists a failing test under **Test contradicts spec**, do not dispatch the implementer for that test. Dispatch the `test-writer` once with the work item, the spec scenario, and that line, to correct only the named test to the spec's contract. It never removes or loosens any other assertion. Then re-run the green gate. The holdout review still checks every test against the spec. A second contradiction on the same test stops and escalates.

   **Premise checkpoint:** after **two failures that share the same
   assumption**, **state the premise** and run **one discriminating observation**
   that could disprove it. There is **no third fix** before this check. If the
   observation does not identify a defensible next action within
   `maxFixAttempts`, stop and escalate.

   **Held-out samples.** When `design.md` records held-out samples, run them
   once after the green gate passes. Dispatch the `test-writer` with only the
   samples under `.review/<changeName>/held-out-samples/` and their labels, to add one test file that runs
   the rule over them and changes no other test. A case the rule gets wrong is
   kept in that file as a recorded miss with its label, so the suite stays
   green and the miss stays visible. Re-run the green gate and persist it as
   `held-out-gate-<source-commit>.json` with the other evidence for the holdout
   review. Never send a miss to the implementer: a rule fixed against held-out
   samples has made them samples it was written from. Name every miss under
   "What the checks do not prove" instead.

9. **Reconcile implementation state without another model call.** Use the
   implementer's existing handoff and the successful green, lint, and typecheck
   artifacts to check the diff against `specs/` and `tasks.md`, then mark only
   the proven `tasks.md` items done. Do not dispatch the implementer or another
   subagent for this bookkeeping step. A missing or ambiguous proof remains
   unchecked and escalates rather than being inferred.

   Then compare the build with its plan:
   ```
   bun "${FACTORY_ROOT}/scripts/plan-drift.ts" <changeDir> <default-branch> HEAD > "<reviewDir>/plan-drift.json"
   ```
   It lists every changed file outside the proposal's Impact paths and the
   feasibility `affectedAreas` recorded in the change metadata, treats test
   files as expected, and flags a low-complexity change larger than the
   contained-diff limits. A non-zero exit means the evidence could not be
   read: stop and escalate. Drift does not stop the run by itself. Pass
   `plan-drift.json` to the holdout review as evidence, and name every
   unplanned file and any size overrun under "What the checks do not prove".
   Then run
   `bun "${FACTORY_ROOT}/scripts/risk-zones.ts" check-diff <repoRoot> <changeDir> <default-branch> HEAD [ledger]`
   with the same ledger as step 2a. Exit 3 means the build touched a red zone
   no person approved for this change: **stop** before the holdout review and
   name the paths. Exit 1 → stop + escalate.

10. **Holdout review (before any MR exists).** The reviewer is read-only (tools: `Read, Grep, Glob` — no Bash/git/MCP), so **the command prepares its inputs as files**: write the branch diff against the default branch to a file (`git diff <default-branch>...HEAD > <reviewDir>/diff.patch`). Pass the complete set of append-only red, green, lint, and typecheck artifacts from steps 5 and 8, and `plan-drift.json` from step 9. Bundle them with the work item, the change's spec files, and the complete diff into one file with `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/diff.patch --evidence <artifact>... --out <reviewDir>/review-packet.md` and give the reviewer that packet as its starting input; the separate files stay available to it. Do NOT re-run gates or roll back implementation to reconstruct evidence. Confirm the required capability: `bun "${FACTORY_ROOT}/scripts/select-model.ts" review` (→ semantic `opus`, therefore `frontier`), then resolve the exact available frontier model. When `routingProfiling` is exactly `always`, follow **Holdout review** in
   `$FACTORY_ROOT/reference/routing-profiling.md` around the reviewer.
   Regardless of this setting, dispatch the `holdout-reviewer`
   subagent with the same resolved frontier model and **only**: the work item,
   `<changeDir>` (the spec), the diff file, the test files, all gate-result
   files, and the **skip report** (`<reviewDir>/skips.md`). **Do not pass the
   implementer's reasoning or any prior chatter.** It returns a `ReviewVerdict`
   JSON. **No MR is opened at this point.**

11. **Let the script route the verdict.**
    ```
    bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
    ```
    Take `maxAttempts` from the `maxFixAttempts` value that `bun "${FACTORY_ROOT}/scripts/config.ts"` prints (2 unless configured). `attempt` is 1 on the first pass and goes up by one per fix loop. **A non-zero exit means the verdict is malformed: stop + escalate**, failing closed. Otherwise act on `action`:
    - **`approve`** → **now open a draft change**, immediately, with no further local review round first (see the hard rule on opening early and checking back). Push the branch (`git push -u origin <changeName>`). **Build the title with the title helper so it always opens with the work-item reference** (Rule 3):
      ```
      bun "${FACTORY_ROOT}/scripts/mr-title.ts" <work-item-key> "<ticket summary>"
      ```
      (yields e.g. `XYZ-123 - Add new fireworks feature`.) The description carries `Closes`, the spec link, a short human-readable paragraph explaining what the change does and how, and any frontier justification — write it like a person would (no field-name dumps, no em dashes; see the human-output rules in `CONVENTIONS.md`). Read the compact test-writer and implementer handoffs. Surface every material `Skipped`, `Not checked`, or `Residual risks` item in plain human language, but do not paste internal headings, raw worker output, or reasoning. If `<reviewDir>/skips.md` lists any skipped scenarios, **surface them in the description** as a short plain-language note ("The following acceptance points were verified as part of this change but intentionally not given a permanent test, because they only describe the migration moment: ..."), so the human sees what was deliberately left untested and why. Never drop skips or unresolved risks silently. Do not repeat a worker's claimed gate result; use only the persisted gate artifacts. End the description with two sections, so a reviewer sees what was decided for them and what the green gate leaves open:
      - `### Decisions made for you`: every choice the approved spec did not make, from both handoffs' **Decisions**, each with why in plain words (a default value, an edge case's behaviour, the reading taken when two requirements clashed, a scope cut). Write `None.` only when both handoffs report none.
      - `### What the checks do not prove`: what the tests fake or stub (a service, the network, the clock), behaviour no test exercises (every **Not checked** item and every skipped scenario), and any rule written from sample data that is tested only against that same data. This section is never `None`.

      Write `{ "approved": true, "draft": true, "sourceBranch": "<changeName>", "targetBranch": "<default-branch>", "title": "<title>", "description": "<description>" }` to `<reviewDir>/create-input.json` and check it:
      ```
      bun "${FACTORY_ROOT}/scripts/change-description.ts" check "<reviewDir>/create-input.json"
      ```
      Non-zero exit → rewrite the description to answer each problem it prints, then check again. Never create the change without a passing check. Then create the draft change with the exact forge command. The change always squashes its commits on merge; the provider sets that on creation where the forge supports it:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" create "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/create-input.json"
      ```
      Non-zero exit → **stop + escalate** (fail closed). Record the returned change `ref` (a user-facing MR iid is an alias for that ref). Then move the ticket to the board's `in-review` column with `bun "${FACTORY_ROOT}/scripts/board-status.ts" sync "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key> in-review`; the same skip and failure rule applies. Stage 3 review, not execute, marks it ready. Render the holdout outcome for the change note and the tracker comment with the summary helper (Rule 2 — never paste raw verdict fields):
      `bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'`.
      Post that summary as a change note **and** one selected-provider note (via `scripts/audit.ts`) with the change URL, stating the review passed and that a human performs the merge. Publish the work-item note only through `work-item-provider.ts note <repoRoot> "${FACTORY_ROOT}/runtime-manifest.json" <note.json>`. Write the forge note body under `.review/`. Write `{ "approved": true, "ref": "<change-ref>", "bodyPath": "<file>" }` to `<reviewDir>/note-input.json`, then:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" note "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/note-input.json"
      ```
      Do not bypass with a provider-native helper or a raw forge API. The command checks the body before any adapter; a refused body is a terminal stop. This posts an individual note that never counts as an unresolved thread blocking the human's merge. **STOP at APPROVED.** Do **not** merge, close, or resolve threads. Do **not** run `/openspec-archive` (it folds the spec into `openspec/specs/` and only makes sense after the human's merge — leave it to a post-merge step).
    - **`fix`** → dispatch the `implementer` subagent to address the verdict `findings`, format and update the spec in that fix commit as step 8 says, re-run the **green gate** (step 8), increment `attempt`, and **go back to step 10** (re-review runs fresh — it does not see the fixer's reasoning). **No MR is created during the fix loop.** If two failed fixes share the same assumption, apply the premise checkpoint from step 8 before any third fix.
    - **`escalate`** → push the branch (`git push -u origin <changeName>`) so a human can inspect the work, post the `reason` (and any `findings`) as a selected-provider note, and stop (NEEDS_HUMAN). **Do not open an MR**; the review did not pass and the human decides what happens next.

12. **Invariants.** A change exists **only** for review-approved work. The factory **creates draft changes but NEVER merges, archives, closes, or resolves threads**; humans own merge, close, thread resolution, and the post-merge archive. The reviewer never sees implementer reasoning; the factory moves the ticket only forward through `board-status.ts sync`, at start and after the change exists. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
