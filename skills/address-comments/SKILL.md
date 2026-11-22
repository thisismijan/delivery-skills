---
name: address-comments
description: Resolve an existing MR's review comments with tests-first rigor. Classify every comment, action, dispute, answer, or skip it, reply on every assessed thread, then run the cumulative tests, lint, and typecheck. Stage 3 review then checks the fixes. The factory never merges, closes, or resolves threads. Use when the operator asks to address an MR's review comments or types /address-comments, or the delivery conductor dispatches this stage. Not for a question about what a comment means, or any other request that needs only an answer.
---

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`, and export `FACTORY_ROOT` as it says.
For a named subagent, follow `$FACTORY_ROOT/agents/<name>.md`; never invent a cheaper substitute prompt.
Load the SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill).
It outranks this skill. Verify with
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" preflight`.
If `.delivery/runs/<id>.run-contract.json` exists, or the ledger records
`continuous-delivery: yes`, check it before mutating:
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" check <run-contract.json> address-comments <work-item-key>`.
Non-zero exit is a terminal stop. Do not add scope the frozen plan does not name.

You are running **/address-comments** for the work item named in the skill arguments (`<work-item-key>`), on the MR `/execute` **already opened** for this ticket's spec branch after a satisfied holdout review. This stage **never** opens one. Take the steps in sequence. Gate exit codes and script verdicts decide; your own reading never overrides them. `reference/` paths are relative to this skill's folder.

## Hard rules for this stage

- **The MR has to exist already.** No open MR on the resolved branch → **stop + escalate**, failing closed, with no commits and nothing posted.
- **A bug gets its test first.** A failing test is proven red through `test-gate.ts` **before** any fix is written, then made green. A test is never edited just so it passes.
- **One fix commit per actioned comment**, referencing the comment; its thread's reply carries the SHA. A `bug` also has its test-only commit first, because the red gate is bound to it. Formatting and spec updates go in the fix commit, never in a commit of their own.
- **No patching the same assumption twice.** Every round is recorded with `review-rounds.ts`; a bug breaking an assumption an earlier round broke gets a premise check before any fix (step 5).
- **Every assessed thread gets exactly one reply** (actioned, answered, or disputed) carrying the `auditComment` prefix. **Resolving a thread is never done here**; people own resolution.
- **One batched round.** Every open comment on the change, from people or automated reviewers, is handled in this one round with the same classification, test-first, and green discipline, never one round per thread.
- **Replies come from the operator:** through `forge-provider.ts reply` with the normal forge credential, so each appears under the forge identity of the operator running this skill. Never post as another person or through a separate bot account.
- **Replay safe.** A thread that already has an `address-comments` audit reply is complete and must not be classified, changed, or replied to again.
- Reviewer rank, sunk cost, or a "nitpick" label never permits silently fixing, discarding, or skipping a comment; route it and reply as step 7 says.
- **Subagents only judge or edit; YOU do all forge, git, and work-item I/O.** The read-only `comment-assessor` (tools: `Read, Grep, Glob`; no `Bash`, no MCP) returns one JSON verdict, raw input to a parser that **fails closed**. Never accept a subagent's prose ("I replied / classified / resolved the thread") as having happened.
- **Fail closed:** an ambiguous change match, a malformed classification verdict, a failed cumulative gate, or exhausted fix attempts → stop + escalate, leaving the MR unblessed and posting no "passed" work-item note.
- **The factory NEVER merges or closes a merge request via the forge provider, and NEVER moves the ticket here.** The ticket stays in review. Its only work-item write is the single summary note at the end.
- **Mutation boundary.** Run `canStartStage` with the runtime's mutation-guard identifier before any write:
  ```
  bun "${FACTORY_ROOT}/scripts/stage-gating.ts" address-comments "${FACTORY_ROOT}/runtime-manifest.json"
  ```
  Non-zero exit → **stop**. A runtime without an enforceable mutation boundary cannot start this stage.
- **Confirmed provider.** Before reading or writing the selected work item, run
  `bun "${FACTORY_ROOT}/scripts/work-item-config.ts" check "$(git rev-parse --show-toplevel)" "${FACTORY_ROOT}/runtime-manifest.json"`.
  Missing or stale selection stops with `/delivery init`; never infer one.

## Steps, in order

1. **Find the change.** Run
   `bun "${FACTORY_ROOT}/scripts/find-change.ts" <work-item-key> openspec/changes`.
   A non-zero exit (no match, or `ambiguous`) is a fail-closed **stop + escalate**; never guess. Otherwise the printed `match` is `<changeName>`, also the branch name, and `openspec/changes/<changeName>` is `<changeDir>`.

2. **Confirm an open change exists.** Resolve `<repoRoot>` with `git rev-parse --show-toplevel`. Create `<reviewDir> = <repoRoot>/.review/<changeName>/address-comments`. Write `{ "sourceBranch": "<changeName>" }` to `<reviewDir>/find-input.json`, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" find "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/find-input.json"
   ```
   Non-zero exit, or **no** open change for the branch → **stop + escalate** (`scripts/escalate.ts` semantics / `assertOrEscalate`) with zero commits and nothing posted. Record the returned opaque change `ref` as `<change-ref>` (an MR iid is an alias for it).

3. **Check out** the spec branch `<changeName>`. Mark the change draft before changing code. Write `{ "approved": true, "ref": "<change-ref>", "draft": true }` to `<reviewDir>/set-draft-input.json`, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" set-draft "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/set-draft-input.json"
   ```
   Non-zero exit → **stop + escalate**. Read `reference/gate-evidence-reuse.md`
   before reusing a persisted per-comment or cumulative gate artifact; stale
   evidence is re-run, never reused. Take `maxFixAttempts` (2 unless
   configured) from what `bun "${FACTORY_ROOT}/scripts/config.ts"` prints.

4. **Gather and scope comments.** Read the full head revision from the
   normalized change returned by `find`. Write
   `{ "ref": "<change-ref>", "headRevision": "<full-head-sha>" }` to
   `<reviewDir>/discussions-input.json`, then fetch discussion threads:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" discussions "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/discussions-input.json" \
     | bun "${FACTORY_ROOT}/scripts/forge-comments.ts" \
     > "<reviewDir>/comments.json"
   ```
   Non-zero exit or unparseable output → **stop + escalate**. The provider result is normalized JSON bound to the requested change and head revision. `forge-comments.ts` flattens it to one entry per non-system note, drops resolved discussions and resolved notes, carries each parent `discussionId` (needed to reply on its thread), and applies `excludeHandledThreads`: a discussion with an authenticated factory note starting with the audit prefix is excluded **entirely**, so its human note is not actioned twice on re-entry.

   For every remaining comment with a new-side `anchor`, read that path at the
   pinned head (`git show <head>:<path>`). Write those contents, or `null` when
   the path is missing, to `<reviewDir>/head-files.json`. Do not invent file
   text. Then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-comments.ts" scope \
     "<reviewDir>/comments.json" "<reviewDir>/head-files.json" \
     > "<reviewDir>/scoped-comments.json"
   ```
   Non-zero exit → **stop + escalate**. The script decides what is outdated;
   read `reference/scope-rules.md` when a scoping result needs explaining. Replace
   `comments.json` with the `inScope` array. Copy the `outdated` array into
   `<reviewDir>/classification.json` (or `[]` when there were none). Write
   `<reviewDir>/expected-comment-ids.json` from every `inScope` id plus every
   `outdated` `commentId`. The resulting `inScope` comments are **in scope**.

5. **Classify (single batch, read-only).** If in-scope comments are empty,
   do not dispatch the `comment-assessor`. Read `reference/empty-scope.md`
   to record that skip, then continue at step 6.

   Otherwise resolve `standard` against the runtime model inventory and read
   `routingProfiling` from `bun "${FACTORY_ROOT}/scripts/config.ts"` (default
   `off`). Only when it is exactly `always`, follow **Comment classification**
   in `$FACTORY_ROOT/reference/routing-profiling.md` around the assessor. When
   it is `off`, skip that block; still persist scripted skips with
   `record-skip.ts` and refresh the scorecard after them. The setting never
   changes classification dispatch or weakens a quality gate. Dispatch
   **exactly one** `comment-assessor` subagent with that exact available model.
   Give it the in-scope comments (each with its `commentId` and its
   `discussionId`, which step 7 replies on), the diff, `<changeDir>`
   (spec + tasks), and every assumption label already recorded in
   `<repoRoot>/.review/<changeName>/review-rounds.json`, so a bug that breaks
   one of them reuses that exact label. It returns one `ClassificationVerdict`
   JSON array. Merge it onto the scripted outdated entries, then validate:
   ```
   bun "${FACTORY_ROOT}/scripts/verdicts.ts" classification "<reviewDir>/classification.json" "<reviewDir>/expected-comment-ids.json"
   ```
   A malformed or missing verdict → **stop + escalate** and action no comments.

   **Record the round.** After a valid verdict, run:
   ```
   bun "${FACTORY_ROOT}/scripts/review-rounds.ts" record "<repoRoot>/.review/<changeName>/review-rounds.json" "<reviewDir>/classification.json" <full-head-sha>
   ```
   Recording the same head again replaces that round, so a re-entry is not a
   new round.
   - Exit 0: no bug repeats an earlier round's assumption. Continue.
   - Exit 3: the printed `repeated` labels were already broken in an earlier
     round. Read **Repeated assumption** in `reference/premise-check.md`
     before writing any fix for those comments. When no defensible approach comes out of it, stop and escalate.
   - Exit 1: the approach was already re-examined for a repeated label, the
     round is past the run's review-round limit without a recorded approval
     for it, or the input is malformed. **Stop + escalate** with the printed reason, make
     zero commits, and post nothing.

6. **Send each comment down its route.** Get every entry's action group from
   `bun "${FACTORY_ROOT}/scripts/classify-route.ts" <classification>`
   (`bug`/`test-gap`/`non-functional` → `action`, `nitpick`/`false-positive` → `dispute`, `question` → `answer`, `outdated` → `skip`). An unknown value makes this throw → stop + escalate. Then process each comment, **one commit per actioned comment**:

   Read `reference/suggestion-apply.md` when an action comment's body is only
   a suggestion fence on a new-side line, before dispatching the `implementer`
   for it; its non-zero exit is a stop + escalate. A bug still needs its red
   test first, and the green gate, lint, and typecheck still run.

   Read `reference/also-at.md` when an action comment, or the review finding
   it repeats, lists **Also at:** locations; the fix then covers every listed
   instance in the same commit and round.

   - **`bug`** (action, tests-first): add a failing test limited to what the comment raises, and prove it red:
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/red-command-<commentId>.json" red --out "<reviewDir>/red-gate-<commentId>-<test-commit>.json"
     ```
     non-zero exit (test passed before the fix) → stop + escalate. Read
     `reference/mechanical-edit-unit.md` when the comment names a bounded
     rename, import-only, or format-only change; a scripted unit skips the
     `implementer`. Otherwise dispatch the `implementer` to write the fix. Do
     not ask the implementer whether the work is menial. Do not dispatch a
     catalogue fast model. A payload flag is not proof that a script ran. Then
     bring the suite green:
     ```
     bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/green-command-<commentId>.json" green --out "<reviewDir>/green-gate-<commentId>-<source-commit>.json"
     ```
     Before the fix commit, run the repository's formatter in fix mode on the
     changed files (the one the lint gate checks, such as `biome check --write`
     or `gofmt -w`), and update `<changeDir>` when the fix changes behaviour the
     spec describes, so both land in that commit. Commit referencing the
     comment, capture the SHA, then run the green gate, lint, and typecheck in
     parallel and persist all three results. When lint fails only on
     formatting, run the formatter, amend that fix commit before it is pushed,
     and re-run the gates. Never add a formatting-only or spec-only commit.

   - **`test-gap`** (action, green with a mutation proof): read
     `reference/test-gap.md`. There is no red gate; a mutation proof shows the
     new test bites. A proof still failing after `maxFixAttempts` stops and
     escalates, and a restore failure is a terminal stop. If writing the test
     shows the behaviour is not correct after all, follow the `bug` path
     instead. Never use this class to skip the red gate on a defect.

   - **`non-functional`** (action, green-only): read
     `reference/mechanical-edit-unit.md` under the same condition as a bug;
     the bug route's rules on asking, fast models, and payload flags apply.
     Otherwise make the change with the current `select-model` worker (no new
     test required), then require the **green gate** plus lint plus typecheck
     to pass. Format, update the spec, and commit as a bug fix does.

     In either action case, a failing gate, lint, or typecheck sends the `implementer` back to repair the **source**, never the tests, and the checks run again. After at most `maxFixAttempts` loops, **stop + escalate** for that comment.
     Read **Repeated fix failures** in `reference/premise-check.md` after two
     failures that share the same assumption; there is no third fix before
     that premise check, and it stops and escalates when it finds no
     defensible next action.

   - **`nitpick` / `false-positive`** (dispute): make **no** code change; record it as "disputed — human decides".

   - **`question`** (answer): draft the answer. Change code **only when** the answer needs it, committed and gated as a `non-functional` action.

   - **`outdated`** (skip): neither a reply nor a code change. It appears only in the closing counts.

7. **Persist pending-gate state when code changed, then reply.** Compare
   `git rev-parse HEAD` with the full head revision recorded in step 2. If they
   differ, or `<reviewDir>/re-review-pending.json` already existed on entry,
   write it with the change ref, current head SHA, comment ids, and gate
   artifact paths; its presence means step 8 must run even when re-entry finds
   zero in-scope comments. Otherwise do not create one: replies and disputes
   did not change the code under review. Then, for each in-scope comment
   **except** those routed `skip`, post **exactly one** reply **on that
   comment's own thread**, its body wrapped with the audit prefix
   (`bun "${FACTORY_ROOT}/scripts/audit.ts" address-comments "<reply body>"`)
   and written under `.review/`. For each reply, write `{ "approved": true, "ref": "<change-ref>", "discussionId": "<discussionId>", "bodyPath": "<file>" }` to a per-note input file, then:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" reply "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reply-input.json>"
   ```
   One call per thread; do not batch. If one fails, report it and stop; do not continue down the list. The command checks the body before any adapter. Do not post a general note in place of a thread reply.
   - actioned (`bug`/`test-gap`/`non-functional`, and `question` that required a change): state what changed and include the **commit SHA**. For a `test-gap`, also say the test was shown to fail when the behaviour is broken.
   - answered (a `question` that needed no change): the reply is the answer itself.
   - disputed (`nitpick`/`false-positive`): the reply gives the reasoning and ends with "disputed — human decides".
   N assessed, unskipped comments get exactly N replies; none is silently ignored. **Never** mark any thread resolved.

8. **Cumulative gates when code changed.** Stage 3 still runs
   `/code-review-max` and `/mr-review` on these fixes next, reviewing what
   changed since their last review, and it is the only authority that may
   undraft. So this round runs no review of its own. If the head still equals the step 2 revision and no
   `re-review-pending.json` existed on entry, skip the cumulative gates because
   their code input is unchanged. Post the single provider summary note with the
   change URL, that no code changed, and the answered/disputed/skipped counts
   in plain language. Leave the change draft, set status to `[addressed !N]`,
   and stop.

   Otherwise, run one full green gate, lint, and typecheck in parallel over the
   cumulative branch and persist every result. On a failure, dispatch the
   `implementer` to fix the **source** (never the tests), format and commit as
   step 6 says, and re-run all three. Loop up to `maxFixAttempts`, applying the
   premise checkpoint from step 6 before any third fix, then **stop +
   escalate**. When all three pass, remove `re-review-pending.json`, leave the
   change **draft**, set status to `[addressed !N]`, and post **one** provider
   summary note through `work-item-provider.ts note <repoRoot> "${FACTORY_ROOT}/runtime-manifest.json" <note.json>`
   (body wrapped via `scripts/audit.ts`) with the change URL, the gate outcome,
   and the **actioned / disputed / skipped** counts written in plain language.
   **STOP.** Never merge, close, or resolve
   threads; a person or the land gate merges.

9. **Invariants.** A passing round leaves the change **draft** under `[addressed !N]`; only Stage 3 dual review may undraft. The factory **never** merges, closes, archives, or resolves threads, and **never** moves the ticket. Every assessed thread received exactly one reply across all re-entries. Every forge read or mutation uses `scripts/forge-provider.ts` with an exact operation; never invent a helper name.
