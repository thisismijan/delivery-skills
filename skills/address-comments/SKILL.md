---
name: address-comments
description: Resolve an existing MR's review comments with tests-first/holdout rigor — classify every comment, action/dispute/answer/skip per class, reply on every assessed thread, then gate the result on a single cumulative Opus holdout re-review. The factory never merges, closes, or resolves threads.
argument-hint: <JIRA-KEY>
disable-model-invocation: true
---

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
export `CLAUDE_PLUGIN_ROOT="$FACTORY_ROOT"` so existing gate scripts keep
working. Cursor has no plugin agent loader: when a step names a subagent, read
`$FACTORY_ROOT/agents/<name>.md` and follow it.


You are running **/address-comments** for Jira ticket **$ARGUMENTS**.

This command consumes the review comments on the **existing** MR for this ticket's spec branch and resolves them. There is already an MR (opened by `/execute` after a satisfied holdout review); this command does **not** create one. Follow the steps in order. Treat the deterministic scripts as ground truth — never substitute your own judgement for a gate's exit code or a script's verdict.

## Hard rules

- **An MR must already exist.** No open MR for the resolved branch → **stop + escalate** (fail closed). Make zero commits and post nothing.
- **Tests first for bugs.** A `bug` comment gets a failing test proven red via `test-gate.ts` **before** any fix code, then brought to green. Never modify a test to make it pass.
- **One commit per actioned comment**, referencing the comment; the reply on that thread carries the commit SHA.
- **Reply on EVERY assessed thread** exactly once (actioned, answered, or disputed) using the `auditComment` prefix. **Never resolve a thread** — humans own resolution.
- **Replay safe.** A thread that already has an `address-comments` audit reply is complete and must not be classified, changed, or replied to again.
- Reviewer rank, sunk cost, or a "nitpick" label never permits silently fixing, discarding, or skipping a comment; route it and leave the human-visible reply required below.
- **Subagents only judge/edit; YOU do all I/O.** The `comment-assessor` and `holdout-reviewer` are read-only by construction (tools: `Read, Grep, Glob` — no `Bash`, no MCP). Their entire contribution is one JSON verdict; treat it as raw input to a parser that **fails closed**. Never accept a subagent's prose ("I replied / classified / resolved the thread") as having happened — its tools cannot do those things. Every `glab`, `git`, and Jira action is performed by **this command**.
- **Fail closed:** no MR, ambiguous change match, malformed classification verdict, malformed/non-approve re-review verdict, or exhausted fix attempts → stop + escalate, leaving the MR unblessed and posting no "passed" Jira comment.
- **The factory NEVER runs `glab mr merge` or `glab mr close`, and NEVER transitions Jira status.** Its only Jira write is the single summary comment at the end.

## Steps

1. **Locate the change.** Run:
   ```
   bun "${FACTORY_ROOT}/scripts/find-change.ts" $ARGUMENTS openspec/changes
   ```
   Non-zero exit (no match, or `ambiguous` with more than one match) → **stop + escalate** (fail closed) without guessing. Otherwise use the printed `match` as `<changeName>` (the branch name; `openspec/changes/<changeName>` is `<changeDir>`).

2. **Confirm an open MR exists.** Check the MR for the source branch via `glab` (e.g. `glab mr list --source-branch <changeName> --state opened --output json`). If there is **no** open MR for the branch, **stop + escalate** (use `scripts/escalate.ts` semantics / `assertOrEscalate`): make zero commits and post nothing. Record the MR IRI/number as `<mr>`.

3. **Check out** the spec branch `<changeName>`. Resolve `<repoRoot>` with `git rev-parse --show-toplevel`, set `<reviewDir> = <repoRoot>/.review/<changeName>/address-comments`, and create it. Mark the MR draft with `glab mr update <mr> --draft` before changing code. Read `maxFixAttempts` (default 2) from:
   ```
   bun "${FACTORY_ROOT}/scripts/config.ts"
   ```

4. **Gather and scope comments.** Fetch the MR's discussion threads via the stable REST endpoint (not `glab mr note list`, whose output shape and subcommand surface differ across `glab` versions), then pipe into the parser/filter:
   ```
   glab api "projects/:fullpath/merge_requests/<mr>/discussions" --paginate | bun "${FACTORY_ROOT}/scripts/glab-comments.ts"
   ```
   (`:fullpath` resolves from the git remote; `--paginate` fetches every page.) `scripts/glab-comments.ts` flattens the discussions to one entry per note (`parseMrComments`, fail-closed on non-JSON / non-array), dropping GitLab system notes and carrying each note's parent `discussionId` (needed to reply on its thread in step 7). It then applies `excludeHandledThreads`: if any note in a discussion starts with the factory audit prefix `**ig-spec** ·`, the **entire discussion** is excluded. Removing only the factory reply would leave the original human note in scope and cause a duplicate action on re-entry. The remaining comments are **in scope**. Non-zero exit (unparseable output) → stop + escalate.

5. **Classify (single batch, read-only).** Dispatch **exactly one** `comment-assessor` subagent (Sonnet, tools `Read, Grep, Glob` only) with the in-scope comments (each with its `commentId` and `discussionId`), the diff, and `<changeDir>` (spec + tasks). Keep each comment's `discussionId` so step 7 can reply on the right thread. It returns a single `ClassificationVerdict` JSON array. Validate it:
   ```
   bun "${FACTORY_ROOT}/scripts/verdicts.ts" classification "<reviewDir>/classification.json" "<reviewDir>/expected-comment-ids.json"
   ```
   A malformed or missing verdict → **stop + escalate** and action no comments. If there are zero in-scope comments the verdict is `[]` — nothing to action; go to step 8 only if any prior change was made, otherwise stop cleanly. After a valid verdict, dispatch `task-profile-controller` (Opus, read-only) for the classify task, validate with `task-profile.ts`, persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/classify-profile.json" sonnet "<reviewDir>/classify-shadow.json"`, then `record-routing.ts persist` into `.delivery/routing/`. Classification still ran on Sonnet; the shadow file must not change that.

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

7. **Persist re-review state, then reply.** First write `<reviewDir>/re-review-pending.json` with the MR iid, current head SHA, comment ids, and gate artifact paths. Its presence means step 8 must run even when re-entry finds zero in-scope comments. Then, for each in-scope comment **except** those routed `skip`, post **exactly one** reply **on that comment's own thread** (not a new general note), wrapping the body with the audit prefix from `scripts/audit.ts`:
   ```
   bun "${FACTORY_ROOT}/scripts/audit.ts" address-comments "<reply body>"
   ```
   Post the reply with the stable REST endpoint, targeting the comment's `discussionId` from step 4 (not `glab mr note`, whose subcommand surface differs across `glab` versions): write the wrapped body to a file and run `glab api "projects/:fullpath/merge_requests/<mr>/discussions/<discussionId>/notes" --field body=@<file>` (`--field ...=@<file>` reads the body from the file; `--raw-field` does NOT expand `@<file>`).
   - actioned (`bug`/`non-functional`, and `question` that required a change): state what changed and include the **commit SHA**.
   - answered (`question` with no change): give the answer.
   - disputed (`nitpick`/`false-positive`): give the reasoned rationale and "disputed — human decides".
   For N assessed (non-skipped) comments, post exactly N replies — none silently ignored. **Never** mark any thread resolved.

8. **Cumulative gates and holdout re-review (the only gate to re-marking ready).** Run one full green gate, lint, and typecheck in parallel over the cumulative branch, persist all results, and stop on any failure. Prepare the reviewer's inputs as files (it is read-only): write the **cumulative** branch diff against the default branch (`git diff <default-branch>...HEAD > <reviewDir>/diff.patch`) and gather every per-comment and cumulative gate artifact. Confirm the reviewer model:
   ```
   bun "${FACTORY_ROOT}/scripts/select-model.ts" review   # -> opus
   # Dispatch task-profile-controller (Opus, read-only) first; persist its JSON.
   bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/review-profile.json"
   bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"
   bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json"
   ```
   Dispatch a **fresh** `holdout-reviewer` subagent (Opus) over the **cumulative** diff (not per-comment) with **only**: the Jira ticket, `<changeDir>` (the spec), the diff file, the test files, and the gate results. Do **not** pass any implementer/assessor reasoning or prior chatter. It returns a `ReviewVerdict` JSON. Route it:
   ```
   bun "${FACTORY_ROOT}/scripts/review-route.ts" "<reviewDir>/holdout-verdict.json" <attempt> <maxAttempts>
   ```
   **Non-zero exit = malformed verdict → stop + escalate** (fail closed): MR not re-marked ready, no Jira "passed" comment. Then act on `action`:

   - **`approve`** → remove `re-review-pending.json`, then re-mark the MR **ready** via `glab` (e.g. `glab mr update <mr> --ready`; never `glab mr merge`/`glab mr close`). Render the holdout outcome for humans with the summary helper (Rule 2 — never paste raw verdict fields):
     ```
     bun "${FACTORY_ROOT}/scripts/review-summary.ts" '<verdict-json>'
     ```
     Post **one** Jira summary comment (wrapped via `scripts/audit.ts`) with the MR link, that rendered holdout outcome, and the **actioned / disputed / skipped** counts written in plain language. **STOP.** A human performs the merge.
   - **`fix`** → dispatch the `implementer` to address the verdict `findings`, re-run the green gate (+ lint/typecheck), increment `attempt`, and **go back to step 8** (the re-review runs fresh). Do **not** re-mark ready during the fix loop. If two failed fixes share the same assumption, apply the premise checkpoint from step 6 before any third fix.
   - **`escalate`** (including `reject`, `shouldEscalate`, or exhausted attempts) → post the `reason`/`findings` as a Jira comment and stop (NEEDS_HUMAN). Leave the MR **unblessed** (not re-marked ready); post no "passed" comment.

9. **Invariants.** The MR is re-marked ready **only** on a satisfied cumulative re-review. The factory **never** merges, closes, archives, or resolves threads, and **never** transitions Jira status — humans own all of that. The reviewer never sees implementer/assessor reasoning. Every assessed thread received exactly one reply across all re-entries; the only Jira write is the single summary comment.
