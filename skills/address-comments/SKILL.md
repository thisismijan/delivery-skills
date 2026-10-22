---
name: address-comments
description: Resolve an existing MR's review comments with tests-first/holdout rigor — classify every comment, action/dispute/answer/skip per class, reply on every assessed thread, then gate the result on a single cumulative Opus holdout re-review. The factory never merges, closes, or resolves threads.
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
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" check <run-contract.json> address-comments <work-item-key>`.
Non-zero exit is a terminal stop. Do not add scope the frozen plan does not name.


You are running **/address-comments** for the work item named in the skill arguments (`<work-item-key>`).

This command consumes the review comments on the **existing** MR for this ticket's spec branch and resolves them. There is already an MR (opened by `/execute` after a satisfied holdout review); this command does **not** create one. Follow the steps in order. Treat the deterministic scripts as ground truth — never substitute your own judgement for a gate's exit code or a script's verdict.

## Hard rules

- **An MR must already exist.** No open MR for the resolved branch → **stop + escalate** (fail closed). Make zero commits and post nothing.
- **Tests first for bugs.** A `bug` comment gets a failing test proven red via `test-gate.ts` **before** any fix code, then brought to green. Never modify a test to make it pass.
- **One commit per actioned comment**, referencing the comment; the reply on that thread carries the commit SHA.
- **Reply on EVERY assessed thread** exactly once (actioned, answered, or disputed) using the `auditComment` prefix. **Never resolve a thread** — humans own resolution.
- **Review-bot threads are in scope, in one batch.** A review bot (an automated reviewer configured with `DELIVERY_REVIEW_BOTS`, which comments only after a change is posted) gets the same classification, test-first, and green discipline as any reviewer. Every open review-bot thread on the change is handled in this one round, never one round per thread. A bot identity is never treated as a factory author, even if it is also listed in `DELIVERY_FACTORY_AUTHORS`.
- **Replies come from the operator.** Every reply is posted through `forge-provider.ts reply` with the normal forge credential, so it appears under the forge identity of the operator running this skill. Never post as another person or through a separate bot account.
- **Replay safe.** A thread that already has an `address-comments` audit reply is complete and must not be classified, changed, or replied to again.
- Reviewer rank, sunk cost, or a "nitpick" label never permits silently fixing, discarding, or skipping a comment; route it and leave the human-visible reply required below.
- **Subagents only judge/edit; YOU do all I/O.** The `comment-assessor` and `holdout-reviewer` are read-only by construction (tools: `Read, Grep, Glob` — no `Bash`, no MCP). Their entire contribution is one JSON verdict; treat it as raw input to a parser that **fails closed**. Never accept a subagent's prose ("I replied / classified / resolved the thread") as having happened — its tools cannot do those things. Every forge, git, and work-item provider action is performed by **this command**.
- **Fail closed:** no MR, ambiguous change match, malformed classification verdict, malformed/non-approve re-review verdict, or exhausted fix attempts → stop + escalate, leaving the MR unblessed and posting no "passed" work-item note.
- **The factory NEVER merges or closes a merge request via the forge provider, and NEVER transitions work-item status.** Its only work-item write is the single summary note at the end.
- **Mutation boundary.** Run `canStartStage` before any write, using the runtime's mutation-guard identifier:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" address-comments "${FACTORY_ROOT}/runtime-manifest.json"
  ```
  Non-zero exit → **stop**. A runtime that does not declare an enforceable mutation boundary cannot start this mutating stage.
- **Confirmed provider.** Before reading or writing the selected work item, run
  `bun "${FACTORY_ROOT}/scripts/work-item-config.ts" check "$(git rev-parse --show-toplevel)" "${FACTORY_ROOT}/runtime-manifest.json"`.
  Missing or stale selection stops with `/delivery init`; never infer one.

## Steps

1. **Locate the change.** Run:
   ```
   bun "${FACTORY_ROOT}/scripts/find-change.ts" <work-item-key> openspec/changes
   ```
   Non-zero exit (no match, or `ambiguous` with more than one match) → **stop + escalate** (fail closed) without guessing. Otherwise use the printed `match` as `<changeName>` (the branch name; `openspec/changes/<changeName>` is `<changeDir>`).

2. **Confirm an open change exists.** Resolve `<repoRoot>` with `git rev-parse --show-toplevel`. Create `<reviewDir> = <repoRoot>/.review/<changeName>/address-comments`. Write `{ "sourceBranch": "<changeName>" }` to `<reviewDir>/find-input.json`, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" find "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/find-input.json"
   ```
   Non-zero exit → **stop + escalate**. If there is **no** open change for the branch, **stop + escalate** (use `scripts/escalate.ts` semantics / `assertOrEscalate`): make zero commits and post nothing. Record the returned opaque change `ref` as `<change-ref>` (a user-facing MR iid is an alias for that ref).

3. **Check out** the spec branch `<changeName>`. Mark the change draft before changing code. Write `{ "approved": true, "ref": "<change-ref>", "draft": true }` to `<reviewDir>/set-draft-input.json`, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" set-draft "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/set-draft-input.json"
   ```
   Non-zero exit → **stop + escalate**. Before reusing a persisted per-comment or cumulative gate artifact, verify it is still bound to the current commit, command, and test file contents. The script calls verifyGateEvidence:
   ```
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/red-gate-<commentId>-<test-commit>.json" "<reviewDir>/red-command-<commentId>.json"
   bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/green-gate-<commentId>-<source-commit>.json" "<reviewDir>/green-command-<commentId>.json"
   ```
   Non-zero exit means the evidence is stale or the command or tests changed — re-run the gate. Do not reuse it. Read `maxFixAttempts` (default 2) from:
   ```
   bun "${FACTORY_ROOT}/scripts/config.ts"
   ```

4. **Gather and scope comments.** Read the full head revision from the
   normalized change returned by `find`. Write
   `{ "ref": "<change-ref>", "headRevision": "<full-head-sha>" }` to
   `<reviewDir>/discussions-input.json`, then fetch discussion threads with the
   exact forge command:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" discussions "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/discussions-input.json" \
     | bun "${FACTORY_ROOT}/scripts/forge-comments.ts" \
     > "<reviewDir>/comments.json"
   ```
   Non-zero exit or unparseable output → **stop + escalate**. The provider result is normalized JSON bound to the requested change and head revision. `forge-comments.ts` flattens it to one entry per non-system note, carries each parent `discussionId` (needed to reply on its thread), and applies `excludeHandledThreads`: if an authenticated factory note in a discussion starts with the audit prefix, the **entire discussion** is excluded. Removing only the factory reply would leave the original human note in scope and cause a duplicate action on re-entry. The resulting comments are **in scope**. Review-bot threads stay in scope like any other: `forge-comments.ts` removes every `DELIVERY_REVIEW_BOTS` identity from the factory authors before scoping, so a bot's own notes never count as the factory's audit trail.

5. **Classify (single batch, read-only).** Resolve `standard` against the runtime
   model inventory. Start a usage timer, then dispatch **exactly one**
   `comment-assessor` subagent with that exact available model (tools
   `Read, Grep, Glob` only), the in-scope comments (each with its `commentId`
   and `discussionId`), the diff, and `<changeDir>` (spec + tasks). Keep each
   comment's `discussionId` so step 7 can reply on the right thread.
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/classify-usage-timer.json"
   ```
   It returns a single `ClassificationVerdict` JSON array. Validate it:
   ```
   bun "${FACTORY_ROOT}/scripts/verdicts.ts" classification "<reviewDir>/classification.json" "<reviewDir>/expected-comment-ids.json"
   ```
   A malformed or missing verdict → **stop + escalate** and action no comments. If there are zero in-scope comments the verdict is `[]` — nothing to action; go to step 8 only if any prior change was made, otherwise stop cleanly. After a valid verdict, resolve `frontier` and dispatch `task-profile-controller` with that exact available model for the classify task, validate with `task-profile.ts`, persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/classify-profile.json" sonnet "<reviewDir>/classify-shadow.json"`. Finish capture after the outcome file exists:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/classify-usage-timer.json" "<reviewDir>/classify-usage.json" --input "<reviewDir>/classify-profile.json" --output "<reviewDir>/classify-outcome.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/classify-profile.json" sonnet "<reviewDir>/classify-outcome.json" "<reviewDir>/classify-usage.json" <controller-model> <standard-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   Pass `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that file. `classify-outcome.json` records whether classification completed, any repairs, and any escalation. Do not omit it; persistence refuses a missing outcome. Never write `{ "source": "unavailable" }` by hand. Classification still used the current semantic standard route; the shadow file must not change that.

6. **Route each comment.** For every entry, derive its action group:
   ```
   bun "${FACTORY_ROOT}/scripts/classify-route.ts" <classification>
   ```
   (`bug`/`non-functional` → `action`, `nitpick`/`false-positive` → `dispute`, `question` → `answer`, `outdated` → `skip`). An unknown value makes this throw → stop + escalate. Then process each comment, **one commit per actioned comment**:

   - **`bug`** (action, tests-first): write a failing test scoped to the comment, prove it red —
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command-<commentId>.json" red | tee "<reviewDir>/red-gate-<commentId>-<test-commit>.json"
     ```
     non-zero exit (test passed before the fix) → stop + escalate. Then dispatch the `implementer` to write the fix, and bring the suite green:
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command-<commentId>.json" green | tee "<reviewDir>/green-gate-<commentId>-<source-commit>.json"
     ```
     Run the green gate, lint, and typecheck in parallel and persist all three results. Commit referencing the comment; capture the commit SHA.

   - **`non-functional`** (action, green-only): make the change (no new test required), then require the **green gate** plus lint plus typecheck to pass (commands as above). Commit referencing the comment; capture the SHA.

     For both action cases, on a gate/lint/typecheck failure dispatch the `implementer` to fix the **source** (never the tests) and re-run; loop a bounded number of times up to `maxFixAttempts`, then **stop + escalate** for that comment.

     After **two failures that share the same assumption**, **state the premise**
     and run **one discriminating observation** that could disprove it. There is
     **no third fix** before this check. If it does not reveal a defensible next
     action within `maxFixAttempts`, stop and escalate.

   - **`nitpick` / `false-positive`** (dispute): make **no** code change. Note it as "disputed — human decides".

   - **`question`** (answer): prepare a reply; make a code change (committed, gated as a `non-functional` action) **only if** the answer requires one.

   - **`outdated`** (skip): no reply, no code change. (Tracked only in the final counts.)

7. **Persist re-review state, then reply.** First write `<reviewDir>/re-review-pending.json` with the change ref, current head SHA, comment ids, and gate artifact paths. Its presence means step 8 must run even when re-entry finds zero in-scope comments. Then, for each in-scope comment **except** those routed `skip`, post **exactly one** reply **on that comment's own thread** (not a new general note), wrapping the body with the audit prefix from `scripts/audit.ts`:
   ```
   bun "${FACTORY_ROOT}/scripts/audit.ts" address-comments "<reply body>"
   ```
   Write the wrapped body under `.review/`. For each reply, write `{ "approved": true, "ref": "<change-ref>", "discussionId": "<discussionId>", "bodyPath": "<file>" }` to a per-note input file, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" reply "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reply-input.json>"
   ```
   One call per thread; do not batch. If one fails, report the failure and stop rather than continuing down the list. The command checks the body before any adapter. Do not post a general note in place of a thread reply.
   - actioned (`bug`/`non-functional`, and `question` that required a change): state what changed and include the **commit SHA**.
   - answered (`question` with no change): give the answer.
   - disputed (`nitpick`/`false-positive`): give the reasoned rationale and "disputed — human decides".
   For N assessed (non-skipped) comments, post exactly N replies — none silently ignored. **Never** mark any thread resolved.

8. **Cumulative gates and holdout re-review (quality gate for this round; Stage 3 dual review is the only authority that may undraft).** Run one full green gate, lint, and typecheck in parallel over the cumulative branch, persist all results, and stop on any failure. Prepare the reviewer's inputs as files (it is read-only): write the **cumulative** branch diff against the default branch (`git diff <default-branch>...HEAD > <reviewDir>/diff.patch`) and gather every per-comment and cumulative gate artifact. Confirm the reviewer model:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" review   # -> opus
   # Resolve frontier and dispatch task-profile-controller read-only first.
   bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/review-profile.json"
   bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/review-usage-timer.json"
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/review-usage-timer.json" "<reviewDir>/review-usage.json" --input "<reviewDir>/review-profile.json" --output "<reviewDir>/review-outcome.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json" "<reviewDir>/review-usage.json" <frontier-model> <frontier-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   Refresh the run scorecard after each persisted task. It reports measured
   live usage and outcomes, while shadow quality and savings remain explicitly
   unevaluated until a paired benchmark exists. Pass
   `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that
   file. Never write `{ "source": "unavailable" }` by hand.
   Resolve `frontier`, then dispatch a **fresh** `holdout-reviewer` subagent
   with that exact available model over the **cumulative** diff (not
   per-comment) and **only**: the work item, `<changeDir>` (the spec), the
   diff file, the test files, and the gate results. Do **not** pass any
   implementer/assessor reasoning or prior chatter. It returns a
   `ReviewVerdict` JSON. Route it:
   ```
   bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
   ```
   **Non-zero exit = malformed verdict → stop + escalate** (fail closed): change not re-marked ready, no work-item "passed" note. Then act on `action`:

   - **`approve`** → remove `re-review-pending.json`. Leave the change **draft**. Do not undraft it. Status becomes `[addressed !N]` until Stage 3 dual review passes (never merge, close, or resolve threads). Render the holdout outcome for humans with the summary helper (Rule 2 — never paste raw verdict fields):
     ```
     bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'
     ```
     Post **one** provider summary note through `work-item-provider.ts note <repoRoot> "${FACTORY_ROOT}/runtime-manifest.json" <note.json>` (body wrapped via `scripts/audit.ts`) with the change URL, that rendered holdout outcome, and the **actioned / disputed / skipped** counts written in plain language. **STOP.** A human performs the merge.
   - **`fix`** → dispatch the `implementer` to address the verdict `findings`, re-run the green gate (+ lint/typecheck), increment `attempt`, and **go back to step 8** (the re-review runs fresh). Do **not** re-mark ready during the fix loop. If two failed fixes share the same assumption, apply the premise checkpoint from step 6 before any third fix.
   - **`escalate`** (including `reject`, `shouldEscalate`, or exhausted attempts) → post the `reason`/`findings` as a provider note and stop (NEEDS_HUMAN). Leave the change **unblessed** (not re-marked ready); post no "passed" note.

9. **Invariants.** Holdout approve leaves the change **draft** under `[addressed !N]`. Stage 3 dual review is the only authority that may undraft. The factory **never** merges, closes, archives, or resolves threads, and **never** transitions work-item status; humans own all of that. The reviewer never sees implementer/assessor reasoning. Every assessed thread received exactly one reply across all re-entries; the only work-item write is the single summary note. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
