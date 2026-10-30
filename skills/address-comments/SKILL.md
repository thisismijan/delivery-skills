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
- **One batched round.** Every open comment on the change, from people or automated reviewers, is handled in this one round with the same classification, test-first, and green discipline, never one round per thread.
- **Replies come from the operator.** Every reply is posted through `forge-provider.ts reply` with the normal forge credential, so it appears under the forge identity of the operator running this skill. Never post as another person or through a separate bot account.
- **Replay safe.** A thread that already has an `address-comments` audit reply is complete and must not be classified, changed, or replied to again.
- Reviewer rank, sunk cost, or a "nitpick" label never permits silently fixing, discarding, or skipping a comment; route it and leave the human-visible reply required below.
- **Subagents only judge/edit; YOU do all I/O.** The `comment-assessor` and `holdout-reviewer` are read-only by construction (tools: `Read, Grep, Glob` — no `Bash`, no MCP). Their entire contribution is one JSON verdict; treat it as raw input to a parser that **fails closed**. Never accept a subagent's prose ("I replied / classified / resolved the thread") as having happened — its tools cannot do those things. Every forge, git, and work-item provider action is performed by **this command**.
- **Fail closed:** no MR, ambiguous change match, malformed classification verdict, malformed/non-approve re-review verdict, or exhausted fix attempts → stop + escalate, leaving the MR unblessed and posting no "passed" work-item note.
- **The factory NEVER merges or closes a merge request via the forge provider, and NEVER moves the ticket here.** The ticket stays in review. Its only work-item write is the single summary note at the end.
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
   Non-zero exit or unparseable output → **stop + escalate**. The provider result is normalized JSON bound to the requested change and head revision. `forge-comments.ts` flattens it to one entry per non-system note, drops resolved discussions and resolved notes, carries each parent `discussionId` (needed to reply on its thread), and applies `excludeHandledThreads`: if an authenticated factory note in a discussion starts with the audit prefix, the **entire discussion** is excluded. Removing only the factory reply would leave the original human note in scope and cause a duplicate action on re-entry.

   For every remaining comment with a new-side `anchor`, read that path at the
   pinned head (`git show <head>:<path>`). Write those contents, or `null` when
   the path is missing, to `<reviewDir>/head-files.json`. Do not invent file
   text. Then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-comments.ts" scope \
     "<reviewDir>/comments.json" "<reviewDir>/head-files.json" \
     > "<reviewDir>/scoped-comments.json"
   ```
   Non-zero exit → **stop + escalate**. A missing path or a new-side line past
   the end of the file is outdated. An empty or whitespace-only body is
   outdated. A body that is only acknowledgements such as LGTM, thanks, approved, or done is outdated. A body that is only a mention is outdated. A body that is only a URL is outdated. A body that is only emoji is outdated. A comment whose body is only a suggestion fence, and whose
   suggested text is already in that file, is outdated. An unanchored comment, an old-side
   anchor, or a path you did not look up stays in scope. Replace
   `comments.json` with the `inScope` array. Copy the `outdated` array into
   `<reviewDir>/classification.json` (or `[]` when there were none). Write
   `<reviewDir>/expected-comment-ids.json` from every `inScope` id plus every
   `outdated` `commentId`. The resulting `inScope` comments are **in scope**.

5. **Classify (single batch, read-only).** If in-scope comments are empty,
   do not dispatch the `comment-assessor`. Write
   `<reviewDir>/skipped-workers.json` naming `comment-assessor` and persist
   even when `routingProfiling` is `off`:
   ```
   bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/skipped-workers.json"
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   The scorecard counts avoided workers. It never estimates tokens saved.
   Keep `classification.json` as the
   scripted outdated verdicts, or `[]` when there were none, then continue
   at step 6. When at least one in-scope comment remains, resolve `standard`
   against the runtime
   model inventory. Read `routingProfiling` from
   `bun "${FACTORY_ROOT}/scripts/config.ts"` (default `off`). When it is exactly
   `always`, start a usage timer. Then dispatch **exactly one**
   `comment-assessor` subagent with that exact available model (tools
   `Read, Grep, Glob` only), the in-scope comments (each with its `commentId`
   and `discussionId`), the diff, and `<changeDir>` (spec + tasks). Keep each
   comment's `discussionId` so step 7 can reply on the right thread. Merge the
   assessor verdicts onto the scripted outdated entries before validating.
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/classify-usage-timer.json"
   ```
   It returns a single `ClassificationVerdict` JSON array. Validate it:
   ```
   bun "${FACTORY_ROOT}/scripts/verdicts.ts" classification "<reviewDir>/classification.json" "<reviewDir>/expected-comment-ids.json"
   ```
   A malformed or missing verdict → **stop + escalate** and action no comments. After a valid verdict, only when `routingProfiling` is `always`, resolve `frontier` and dispatch `task-profile-controller` with that exact available model for the classify task, validate with `task-profile.ts`, persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/classify-profile.json" sonnet "<reviewDir>/classify-shadow.json"`, and finish capture after the outcome file exists:
   ```
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/classify-usage-timer.json" "<reviewDir>/classify-usage.json" --input "<reviewDir>/classify-profile.json" --output "<reviewDir>/classify-outcome.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/classify-profile.json" sonnet "<reviewDir>/classify-outcome.json" "<reviewDir>/classify-usage.json" <controller-model> <standard-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   Pass `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that file. `classify-outcome.json` records whether classification completed, any repairs, and any escalation. Do not omit it; persistence refuses a missing outcome. Never write `{ "source": "unavailable" }` by hand. Classification still used the current semantic standard route; the shadow file must not change that. When `routingProfiling` is `off`, skip the timer, profile, usage capture, routing persistence, and scorecard commands. Still persist scripted skips with `record-skip.ts` and refresh the scorecard after those skips. This setting only removes diagnostic work; it never changes classification dispatch or weakens a quality gate.

6. **Route each comment.** For every entry, derive its action group:
   ```
   bun "${FACTORY_ROOT}/scripts/classify-route.ts" <classification>
   ```
   (`bug`/`non-functional` → `action`, `nitpick`/`false-positive` → `dispute`, `question` → `answer`, `outdated` → `skip`). An unknown value makes this throw → stop + escalate. Then process each comment, **one commit per actioned comment**:

   For an action comment whose body is only a suggestion fence on a new-side
   line, write that comment to `<reviewDir>/comment-<commentId>.json`
   and, where the steps below would dispatch the `implementer` for the fix, run
   instead:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-comments.ts" apply-suggestion "<reviewDir>/comment-<commentId>.json" "<repoRoot>"
   ```
   Non-zero exit → **stop + escalate**. When `apply` is `script`, the helper
   already replaced that line, so do not dispatch the `implementer` for it.
   Persist that skip with `record-skip.ts` naming `implementer`, then refresh
   `routing-scorecard.ts`, even when `routingProfiling` is `off`. The
   scorecard counts avoided workers. It never estimates tokens saved.
   When `apply` is `model`, continue as below. A bug still needs its red test
   first, and the green gate, lint, typecheck, and holdout still run.

   - **`bug`** (action, tests-first): write a failing test scoped to the comment, prove it red —
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command-<commentId>.json" red | tee "<reviewDir>/red-gate-<commentId>-<test-commit>.json"
     ```
     non-zero exit (test passed before the fix) → stop + escalate. Then classify
     a mechanical-edit unit if the comment names a bounded rename, import-only,
     or format-only change:
     ```
     bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit-<commentId>.json" "<repoRoot>"
     ```
     Incomplete or free-text comments are not a unit. Persist the JSON plan.
     Proven TypeScript, JavaScript, Python, Java, Go, C#, and Kotlin rename, import-only, and format-only
     units apply here without a model. Rust, PHP, and Swift format-only also apply without a model when the repository provides `bin/rustfmt`, `bin/php-format`, or `bin/swift-format`. That includes a unique Python parameter or
     local, a unique Java field, a Java type whose listed file name matches, a
     unique TypeScript, Python, Java, Go, C#, or Kotlin missing import, and format-only through a repo Prettier,
     Ruff, or google-java-format binary, the Go standard formatter, repo-local `bin/csharpier`, or repo-local `bin/ktfmt`, when names and literals stay identical.
     When `apply` is `script`, the helper
     already wrote the files. Persist that skip with `record-skip.ts` naming
     `implementer`, then refresh `routing-scorecard.ts`. The scorecard counts
     avoided workers. It never estimates tokens saved. Otherwise
     dispatch the `implementer` to write the fix. Do not ask the implementer
     whether the work is menial. Do not dispatch a catalogue fast model. A
     payload flag is not proof that a script ran. Then bring the
     suite green:
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command-<commentId>.json" green | tee "<reviewDir>/green-gate-<commentId>-<source-commit>.json"
     ```
     Run the green gate, lint, and typecheck in parallel and persist all three results. Commit referencing the comment; capture the commit SHA.

   - **`non-functional`** (action, green-only): apply a mechanical-edit unit
     the same way as a bug action. When `apply` is `script`, the helper already
     wrote the files. Persist that skip with `record-skip.ts` naming
     `implementer`, then refresh `routing-scorecard.ts`. Otherwise make the change with the current `select-model`
     worker (no new test required), then require the **green gate** plus lint
     plus typecheck to pass (commands as above). Do not ask the implementer
     whether the work is menial. Do not dispatch a catalogue fast model. A
     payload flag is not proof that a script ran. Commit referencing the
     comment; capture the SHA.

     For both action cases, on a gate/lint/typecheck failure dispatch the `implementer` to fix the **source** (never the tests) and re-run; loop a bounded number of times up to `maxFixAttempts`, then **stop + escalate** for that comment.

     After **two failures that share the same assumption**, **state the premise**
     and run **one discriminating observation** that could disprove it. There is
     **no third fix** before this check. If it does not reveal a defensible next
     action within `maxFixAttempts`, stop and escalate.

   - **`nitpick` / `false-positive`** (dispute): make **no** code change. Note it as "disputed — human decides".

   - **`question`** (answer): prepare a reply; make a code change (committed, gated as a `non-functional` action) **only if** the answer requires one.

   - **`outdated`** (skip): no reply, no code change. (Tracked only in the final counts.)

7. **Persist re-review state when code changed, then reply.** Compare
   `git rev-parse HEAD` with the full head revision recorded in step 2. If they
   differ, or `<reviewDir>/re-review-pending.json` already existed on entry,
   write `<reviewDir>/re-review-pending.json` with the change ref, current head
   SHA, comment ids, and gate artifact paths. Its presence means step 8 must run
   even when re-entry finds zero in-scope comments. If the revisions are equal
   and no pending marker existed, do not create one: replies and disputes did
   not change the code under review. Then, for each in-scope comment **except**
   those routed `skip`, post **exactly one** reply **on that comment's own
   thread** (not a new general note), wrapping the body with the audit prefix
   from `scripts/audit.ts`:
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

8. **Cumulative gates and holdout re-review when code changed (quality gate
   for this round; Stage 3 dual review is the only authority that may
   undraft).**    If the head still equals the step 2 revision and no
   `re-review-pending.json` existed on entry, skip the cumulative gates and
   holdout re-review because their code input is unchanged. Persist that skip
   with `record-skip.ts` naming `holdout-reviewer`, then refresh
   `routing-scorecard.ts`, even when `routingProfiling` is `off`. The
   scorecard counts avoided workers. It never estimates tokens saved. Post the single
   provider summary note with the change URL, state that no code changed, and
   include the answered/disputed/skipped counts in plain language. Leave the
   change draft, set status to `[addressed !N]`, and stop. Stage 3 still runs
   `/code-review-max` and `/mr-review` and remains the only authority that may
   undraft.

   Otherwise, run one full green gate, lint, and typecheck in parallel over the
   cumulative branch, persist all results, and stop on any failure. Prepare the
   reviewer's inputs as files (it is read-only): write the **cumulative** branch
   diff against the default branch (`git diff <default-branch>...HEAD >
   <reviewDir>/diff.patch`) and gather every per-comment and cumulative gate
   artifact. Confirm the reviewer model:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" review   # -> opus
   # Only when routingProfiling is exactly always: resolve frontier and dispatch task-profile-controller read-only first.
   bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/review-profile.json"
   bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/review-usage-timer.json"
   bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/review-usage-timer.json" "<reviewDir>/review-usage.json" --input "<reviewDir>/review-profile.json" --output "<reviewDir>/review-outcome.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json" "<reviewDir>/review-usage.json" <frontier-model> <frontier-model>
   bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
   ```
   Only in `always` mode, refresh the run scorecard after each persisted task. It reports measured
   live usage and outcomes, while shadow quality and savings remain explicitly
   unevaluated until a paired benchmark exists. Pass
   `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that
   file. Never write `{ "source": "unavailable" }` by hand. When
   `routingProfiling` is `off`, skip the timer, profile, usage-capture,
   routing-persistence, and scorecard commands. Still persist scripted skips
   with `record-skip.ts` and refresh the scorecard after those skips.
   Regardless of this setting, resolve `frontier`, then dispatch a **fresh**
   `holdout-reviewer` subagent
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

9. **Invariants.** Holdout approve leaves the change **draft** under `[addressed !N]`. Stage 3 dual review is the only authority that may undraft. The factory **never** merges, closes, archives, or resolves threads, and **never** moves the ticket; humans own all of that. The reviewer never sees implementer/assessor reasoning. Every assessed thread received exactly one reply across all re-entries; the only work-item write is the single summary note. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
