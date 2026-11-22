---
name: execute
description: Phase 2 — implement an approved OpenSpec change test-first (red gate -> implement -> green gate), run the Opus holdout review, and ONLY on a satisfied review open a draft merge request for Stage 3. The factory never merges. Invoking this command or a recorded continuous-delivery run authorizes the build. Use when the operator asks to build an approved change or types /execute, or the delivery conductor dispatches this stage. Not for a question about a change, a spec, or a review, or any other request that needs only an answer.
---

Resolve this SKILL.md to its real path and load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`; export `FACTORY_ROOT` as it describes.
When a step names a subagent, follow `$FACTORY_ROOT/agents/<name>.md`, never a
cheaper substitute prompt. The SDLC constitution (`SDLC-CONSTITUTION.md` beside
the delivery skill) outranks this skill; verify it with
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" preflight`.
If `.delivery/runs/<id>.run-contract.json` exists or the ledger records
`continuous-delivery: yes`, run
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" check <run-contract.json> execute <work-item-key>`
before mutating; non-zero exit is a terminal stop. Add no scope the frozen plan does not name.

**/execute** builds the approved change for the work item in the skill arguments (`<work-item-key>`). Take the steps in sequence. A gate's exit code decides; your own reading never overrides it.

## Hard rules for this stage

- **Tests first.** Write tests before implementation and prove they fail (red gate), unless `apply-mechanical-edit.ts` reports `apply` is `script`, when the existing suite plus green, lint, and typecheck is the proof. Never modify tests to make them pass. Never skip holdout.
- **No pressure bypass.** Time pressure never permits skipping the red gate (except a scripted mechanical-edit unit), the green gate, holdout review, or operator-owned action.
- **Review comes first, then the MR.** The holdout reviewer judges the **committed branch diff and the gate results**; **the MR opens only after it says `approve`**, and unreviewed, sent-back, rejected, or escalated work never gets one. **Open the change as soon as the first holdout review is satisfied, then check back on it**: the first `approve` opens the draft in the same step; never hold it back for extra local review rounds. Reviewers, people or automated, often comment only once a change is posted, and release readiness answers them in one `/address-comments` round before reporting it ready.
- **Gated writes only:** the branch commit and push, the post-approval change, and notes on it and the selected work item. **The factory NEVER merges, closes, or resolves threads.** It moves the ticket only forward, only through `board-status.ts sync`; humans own those and every other status change.
- **Fail closed:** a missing spec, several matching specs, a gate that never ran, or a gate still red once attempts run out means stop + escalate. Code that is not green never gets an MR.
- **Mutation boundary.** Run `canStartStage` before any write:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" execute "${FACTORY_ROOT}/runtime-manifest.json"
  ```
  Non-zero exit, or a runtime whose mutation boundary is unenforced or unknown → **stop**.
- **Confirmed provider.** Before reading or writing a work-item note, run
  `bun "${FACTORY_ROOT}/scripts/work-item-config.ts" check "$(git rev-parse --show-toplevel)" "${FACTORY_ROOT}/runtime-manifest.json"`.
  Missing or stale selection stops with `/delivery init`; never infer one.

## Steps, in order

1. **Locate the change.** Run
   `bun "${FACTORY_ROOT}/scripts/find-change.ts" <work-item-key> openspec/changes`.
   Non-zero exit (no match, or `ambiguous`) → **stop + escalate**. Otherwise the printed `match` is `<changeName>`, also the branch, and `<changeDir>` is `openspec/changes/<changeName>`.

2. **Verify the spec, failing closed.** Run
   `bun "${FACTORY_ROOT}/scripts/verify-change.ts" <changeDir>`;
   any non-zero exit → stop + escalate.

2a. **Red zones.** Run
   `bun "${FACTORY_ROOT}/scripts/risk-zones.ts" check <repoRoot> <changeDir> [ledger]`
   with the run ledger if any (an auto worker's is beside its journal). Exit 3
   (an unapproved red zone) → **stop**, name the zones, and read
   `reference/red-zones.md` for what approval counts. Exit 1 (unreadable map) → stop + escalate.

3. **Check out** the spec branch `<changeName>`, resolve `<repoRoot>` with `git rev-parse --show-toplevel`, and `mkdir -p` `<reviewDir>` (`<repoRoot>/.review/<changeName>`), gitignored scratch for append-only evidence, never committed. Move the ticket to `in-progress`:
   ```
   bun "${FACTORY_ROOT}/scripts/board-status.ts" sync "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key> in-progress
   ```
   A skipped sync prints its reason; name it in the stage summary and continue. A non-zero exit is a provider failure: report it in plain words and continue. Never retry it or move the ticket any other way.

3a. **Re-entry reconciliation.** On a resume or with prior state (an open
   change, `<reviewDir>` evidence, commits after the spec, a dirty worktree),
   read `reference/re-entry.md` and reconcile before any write. A failed forge
   lookup or unattributable state → stop + escalate; an open change at the
   branch head → stop successfully.

3b. **Scripted mechanical-edit first.** For a bounded rename, import-only, or
   format-only unit (see `$FACTORY_ROOT/reference/mechanical-edit.md`), follow
   **Before the test writer** in `reference/scripted-edit.md` first; when
   `apply` is `script`, continue at step 8.

3c. **Characterization pass.** Run
   `bun "${FACTORY_ROOT}/scripts/characterize.ts" check <repoRoot> <changeDir>`.
   Exit 0: no pass runs. Exit 3 lists
   `pinned` files, each with its reason (no test references it, or yellow
   zone): read `reference/characterization.md` and pin them before step 4.
   A failing characterization run stops + escalates. Exit 1 → stop.

4. **Write tests first.** Build the code map with
   `bun "${FACTORY_ROOT}/scripts/code-map.ts" "<repoRoot>" <changeDir> > "<reviewDir>/code-map.md"`
   (non-zero exit → stop + escalate), then the packet with
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec <changeDir> --context <reviewDir>/code-map.md --out <reviewDir>/test-packet.md`.
   When `<changeDir>/comprehension.md` exists, add `--context <changeDir>/comprehension.md` to this packet and to the implementer's packet in step 7.
   Dispatch the `test-writer` with the exact available model `standard`
   resolves to in `.delivery/routing/model-inventory.json` and the packet as
   its starting input. It writes test files only: **durable** tests,
   **skipping** point-in-time migration scenarios with a reason each ("Test
   durability" in `CONVENTIONS.md`). Capture its compact handoff verbatim to
   `<reviewDir>/test-writer-handoff.md` and its `Skipped` section, unrewritten,
   to `<reviewDir>/skips.md` (or `none`). The holdout reviewer gets only the
   skip artifact, never the worker's reasoning or handoff.

5. **Red gate (enforced).** Write `<reviewDir>/red-command.json` (an argv array, never a shell string; the repo cwd; every expected new test path; a timeout), run it, and persist its JSON under an append-only name containing the test commit:
   ```
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command.json" red --out "<reviewDir>/red-gate-<test-commit>.json"
   ```
   Only that exit code decides. Non-zero (the new tests pass without an implementation) → **stop + escalate**, no MR.

6. **Select the implementation model.** **Never re-judge complexity**; `/draft` already did. Read it with
   `bun "${FACTORY_ROOT}/scripts/change-meta.ts" read <changeDir>`
   and feed its `complexitySignal` (plus any `frontierJustification`) to:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" implement <complexitySignal> "<frontierJustification from the meta>"
   ```
   When the meta read exits non-zero or the selection prints `opus`, read `reference/model-selection.md`; never guess. Map `sonnet` to `standard` and `opus` to `frontier`; the exact model that tier resolves to in `.delivery/routing/model-inventory.json` is the implementation worker.

   **Routing profiling.** Read `routingProfiling` from
   `bun "${FACTORY_ROOT}/scripts/config.ts"` (default `off`). Only when it is
   exactly `always`, follow **Implementation** in
   `$FACTORY_ROOT/reference/routing-profiling.md` around the implementer.
   Profiling never changes the live model or weakens a quality gate.
   Do not dispatch a catalogue fast model unless it is live. Its promotion
   rules and safety floors are in `$FACTORY_ROOT/reference/fast-models.md`.

7. **Implement to green.** Build its packet:
   `git diff <default-branch>...HEAD > <reviewDir>/implement-diff.patch`, then
   `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/implement-diff.patch --evidence <red-gate-artifact> --context <reviewDir>/code-map.md --out <reviewDir>/implement-packet.md`.
   Rebuild it before every fix dispatch, with the failing gate artifact or the
   review findings as evidence.
   If this dispatch is a bounded rename, import-only, or format-only unit,
   follow **Before an implementer dispatch** in `reference/scripted-edit.md`.
   When `apply` is `script`, do not dispatch the `implementer`; record the skip
   as that section says and continue at the green gates (step 8).
   Otherwise dispatch the `implementer` with the packet as its starting input
   and the exact model from step 6, overriding the prompt's static model (a
   host that cannot override it uses `implementer-opus` only for the semantic
   frontier case). Capture its compact handoff verbatim to
   `<reviewDir>/implementer-handoff.md`, an audit and summary input only:
   never pass it, the implementer's plan, or implementation reasoning to the
   holdout reviewer.

8. **Green gates.** Before every test or source commit, run the formatter the
   lint gate checks in fix mode on that commit's files (for example
   `biome check --write`), so formatting is never
   a commit of its own. When lint fails only on formatting, format, amend that
   unpushed source commit, and re-run the gates. A fix that changes behaviour
   the spec describes updates `<changeDir>` in the same commit. Write
   `<reviewDir>/green-command.json` (argv, cwd, all expected test paths). Run
   the full green gate, lint, and typecheck **in parallel**, persist each
   result under an append-only name containing the source commit, and wait for
   all three:
   ```
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command.json" green --out "<reviewDir>/green-gate-<source-commit>.json"
   ```
   If any fails, dispatch the `implementer` again to fix the source (not the tests). Loop a small bounded number of times (the formal ceiling is N6), then **stop + escalate**.

   When the implementer's handoff lists a failing test under **Test contradicts spec**, do not dispatch the implementer for that test; read `reference/test-contradicts-spec.md`. A second contradiction on the same test stops and escalates.

   **Premise checkpoint:** after **two failures that share the same
   assumption**, **state the premise** and run **one discriminating observation**
   that could disprove it. There is **no third fix** before this check. If the
   observation does not identify a defensible next action within
   `maxFixAttempts`, stop and escalate.

   **Held-out samples.** When `design.md` records held-out samples under
   `.review/<changeName>/held-out-samples/`, read
   `reference/held-out-samples.md` once the green gate passes.

9. **Reconcile implementation state without another model call.** Using the
   implementer's handoff and the passing gate artifacts, check the diff against
   `specs/` and `tasks.md` and mark only the proven items done. Do not dispatch
   the implementer or another subagent for this bookkeeping step. A missing or
   ambiguous proof stays unchecked and escalates.

   Then check plan drift:
   ```
   bun "${FACTORY_ROOT}/scripts/plan-drift.ts" <changeDir> <default-branch> HEAD > "<reviewDir>/plan-drift.json"
   ```
   Non-zero exit (unreadable evidence) → stop + escalate. Drift alone does not
   stop the run: pass `plan-drift.json` to the holdout review, and name every unplanned file and any size overrun under "What the checks do not prove".
   Then run
   `bun "${FACTORY_ROOT}/scripts/risk-zones.ts" check-diff <repoRoot> <changeDir> <default-branch> HEAD [ledger]`
   with the same ledger as step 2a. Exit 3 (an unapproved red zone in the
   diff) → **stop** before the holdout review and name the paths. Exit 1 →
   stop + escalate.

10. **Holdout review (before any MR exists).** The reviewer is read-only, so give it files: `git diff <default-branch>...HEAD > <reviewDir>/diff.patch`, then build its packet with every red, green, lint, and typecheck artifact from steps 5 and 8 and `plan-drift.json` from step 9 as evidence: `bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item-file> --spec openspec/changes/<changeName> --diff <reviewDir>/diff.patch --evidence <artifact>... --out <reviewDir>/review-packet.md`. Do NOT re-run gates or roll back implementation to reconstruct evidence. `bun "${FACTORY_ROOT}/scripts/select-model.ts" review` prints `opus`, so resolve the exact available `frontier` model. When `routingProfiling` is exactly `always`, follow **Holdout review** in
   `$FACTORY_ROOT/reference/routing-profiling.md` around the reviewer.
   Regardless of this setting, dispatch the `holdout-reviewer` with that model,
   the packet as its starting input, and **only** the work item, `<changeDir>`, the diff,
   the test files, the gate-result files, and the **skip report**
   (`<reviewDir>/skips.md`). **Never pass implementer reasoning or prior
   chatter.** It returns a `ReviewVerdict` JSON. **No MR is opened yet.**

11. **Let the script route the verdict.**
    ```
    bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
    ```
    `maxAttempts` is the `maxFixAttempts` value `bun "${FACTORY_ROOT}/scripts/config.ts"` prints (2 unless configured); `attempt` starts at 1 and rises by one per fix loop. Non-zero exit (a malformed verdict) → **stop + escalate**. Otherwise act on `action`:
    - **`approve`** → **open a draft change now**. Push the branch (`git push -u origin <changeName>`) and **build the title, which always opens with the work-item reference** (Rule 3):
      ```
      bun "${FACTORY_ROOT}/scripts/mr-title.ts" <work-item-key> "<ticket summary>"
      ```
      Write the description in plain human prose (no field-name dumps or em dashes; see `CONVENTIONS.md`): `Closes`, the spec link, a short paragraph on what the change does and how, and any frontier justification. Surface every material `Skipped`, `Not checked`, or `Residual risks` item from both compact handoffs in plain language, never as internal headings, raw worker output, or reasoning. Note each `<reviewDir>/skips.md` scenario as verified but deliberately untested because it only describes the migration moment. Never drop skips or unresolved risks silently. Cite only persisted gate artifacts, never a worker's claimed result. End with:
      - `### Decisions made for you`: every choice the approved spec did not make, from both handoffs' **Decisions**, each with why in plain words (a default, an edge case's behaviour, a clash between requirements, a scope cut). `None.` only when both handoffs report none.
      - `### What the checks do not prove`: what the tests fake or stub (a service, the network, the clock), behaviour no test exercises (every **Not checked** item and skipped scenario), and any rule tested only against the sample data it was written from. Never `None`.

      Write `{ "approved": true, "draft": true, "sourceBranch": "<changeName>", "targetBranch": "<default-branch>", "title": "<title>", "description": "<description>" }` to `<reviewDir>/create-input.json` and check it:
      ```
      bun "${FACTORY_ROOT}/scripts/change-description.ts" check "<reviewDir>/create-input.json"
      ```
      Non-zero exit → rewrite the description to answer each problem it prints, then check again. Never create the change without a passing check. Then create the draft change, which always squashes its commits on merge:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" create "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/create-input.json"
      ```
      Non-zero exit → **stop + escalate**. Record the returned change `ref`. Move the ticket with `bun "${FACTORY_ROOT}/scripts/board-status.ts" sync "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key> in-review` under the same skip and failure rule; Stage 3 review, not execute, marks it ready. Render the holdout outcome with `bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'` (Rule 2: never paste raw verdict fields). Post it, with the change URL, saying the review passed and a human merges, as a change note **and** one selected-provider note (via `scripts/audit.ts`), the latter only through `work-item-provider.ts note <repoRoot> "${FACTORY_ROOT}/runtime-manifest.json" <note.json>`. For the change note, write its body under `.review/` and `{ "approved": true, "ref": "<change-ref>", "bodyPath": "<file>" }` to `<reviewDir>/note-input.json`, then:
      ```
      bun "${FACTORY_ROOT}/scripts/forge-provider.ts" note "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/note-input.json"
      ```
      Never bypass it with a provider-native helper or raw forge API. It checks the body first; a refused body is a terminal stop. **STOP at APPROVED.** Never run `/openspec-archive`; it belongs after the human's merge.
    - **`fix`** or **`escalate`** → read `reference/verdict-routes.md`. Neither opens an MR; `escalate` pushes the branch, posts the reason, and stops (NEEDS_HUMAN).

12. **Invariants.** A change exists **only** for review-approved work. The factory **creates draft changes but NEVER merges, archives, closes, or resolves threads**; humans own those. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
