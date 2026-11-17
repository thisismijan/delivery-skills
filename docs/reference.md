# Reference

## Installer

```text
./install.sh --skills-dir <path> [--adapter <name>] [--provider <name>]...
./install.sh --help
```

`bash adapters/cursor/install-plugin.sh` runs the same install inside a local
Cursor plugin and adds the agents, with the judging ones declared read-only;
see `adapters/cursor/README.md`.

Environment:

| Variable | Role |
|----------|------|
| `DELIVERY_ADAPTERS_DIR` | Override `adapters/` |
| `DELIVERY_PROVIDERS_DIR` | Override `providers/` |
| `DELIVERY_BIN_DIR` | Where provider tools are installed (`~/.local/bin`) |
| `DELIVERY_INSTALL_SKIP_BUN` | Skip `bun install` (tests) |
| `DELIVERY_FACTORY_ROOT` | Installed `_factory` for doctor and gates |
| `DELIVERY_SKILLS_DIR` | Installed skills directory |
| `CURSOR_SKILLS_DIR` | Cursor wrapper destination |
| `CURSOR_AGENT_STORE` | Cloud store install destination |
| `CLAUDE_SKILLS_DIR` | Claude wrapper destination |
| `CLAUDE_SETTINGS_FILE` | Claude settings for the mutation hook and agent-summary preload |
| `CLAUDE_AGENTS_DIR` | Where the Claude Code adapter installs the factory agents as native subagents (`~/.claude/agents`) |
| `CURSOR_HOOKS_FILE` | Cursor `hooks.json` for the mutation hook |
| `DELIVERY_LEVEL` | The run's level, `min`, `standard`, or `max` (`scripts/config.ts`, default `standard`). Unknown values fail closed |
| `MAX_FIX_ATTEMPTS` | Bounded repair attempts (`scripts/config.ts`, default 2) |
| `MAX_PARALLEL_WORKTREES` | Concurrent isolated auto worktrees (`scripts/config.ts`, default 4) |
| `MAX_REVIEW_ROUNDS` | Review rounds auto runs without a ready verdict before it stops (`scripts/config.ts`, default 3) |
| `WORKER_IDLE_MINUTES` | Minutes without a journal write before auto stops a parallel worker as idle (`scripts/config.ts`, default 20) |
| `MAX_AWAITING_REVIEW` | Open changes, plus workers still building one, that may wait on the operator before auto starts more work (`scripts/config.ts`, default 5) |
| `REVIEW_SETTLE_MINUTES` | Reviewing minutes a change waits after it leaves draft, is pushed, or is commented on before it may be queued, unless every commenting reviewer already approved (`scripts/config.ts`, default 30) |
| `REVIEW_QUIET_HOURS` | Daily range such as `19:00-08:45` whose minutes do not count toward the settle window, so overnight changes wait for the morning review pass. Unset by default |
| `REVIEW_TIMEZONE` | Time zone for `REVIEW_QUIET_HOURS` (`scripts/config.ts`, default `UTC`). An unknown zone fails closed |
| `DELIVERY_FACTORY_AUTHORS` | Comma-separated forge usernames whose replies count as the operator's: the factory's own account and the operator's (default `factory,delivery-bot`). The change author always counts |
| `ROUTING_PROFILING` | Diagnostic shadow-routing evidence. Defaults to `off`. Set `always` to collect evaluation evidence. Does not change live model selection, holdout review of new or changed code, or quality gates |

## Cost-control scripts

```text
bun "$FACTORY_ROOT/scripts/config.ts"
bun "$FACTORY_ROOT/scripts/config.ts" ready-wave <keys-json> [<dispatch.json> [<ledger.md>]]
bun "$FACTORY_ROOT/scripts/review-fanout.ts" <input.json>
bun "$FACTORY_ROOT/scripts/review-fanout.ts" readiness <input.json>
bun "$FACTORY_ROOT/scripts/review-fanout.ts" paths <base-or-since> <head> [--earlier <lens-coverage.json>]
bun "$FACTORY_ROOT/scripts/review-fanout.ts" coverage <base-or-since> <head> <input.json> <lens-coverage.json> [--earlier <lens-coverage.json>]
bun "$FACTORY_ROOT/scripts/diff-scan.ts" <base> <head>
bun "$FACTORY_ROOT/scripts/forge-comments.ts" scope <comments.json> <head-files.json>
bun "$FACTORY_ROOT/scripts/forge-comments.ts" apply-suggestion <comment.json> <repo-root>
bun "$FACTORY_ROOT/scripts/ticket-structure.ts" <work-item.json>
bun "$FACTORY_ROOT/scripts/ticket-feasibility.ts" <work-item.json>
bun "$FACTORY_ROOT/scripts/apply-mechanical-edit.ts" <input.json> <repo-root>
bun "$FACTORY_ROOT/scripts/generate-tasks.ts" <change-dir>
bun "$FACTORY_ROOT/scripts/record-skip.ts" persist <routing-root> <run-id> <skips.json>
bun "$FACTORY_ROOT/scripts/routing-scorecard.ts" <routing-root> <run-id>
bun "$FACTORY_ROOT/scripts/review-packet.ts" --ticket <file> --spec <change-dir> [--diff <file>] [--evidence <file>]... [--context <file>]... --out <file>
bun "$FACTORY_ROOT/scripts/look-away-metrics.ts" <state-root> <run-id>
```

`config.ts` prints the validated knobs, including `level`,
`maxParallelWorktrees`, `maxReviewRounds`, `overrides`, and
`routingProfiling`. Unknown `ROUTING_PROFILING` values fail closed.

## Review rounds

```text
bun "$FACTORY_ROOT/scripts/review-rounds.ts" record <review-rounds.json> <classification.json> <head-sha>
bun "$FACTORY_ROOT/scripts/review-rounds.ts" premise <review-rounds.json> <assumption> <outcome.md>
bun "$FACTORY_ROOT/scripts/review-rounds.ts" allow <review-rounds.json> <round> <approval.json>
```

`/address-comments` records each round in
`.review/<changeName>/review-rounds.json`. The comment assessor labels every
bug with the design assumption it breaks, reusing an earlier round's label
for the same idea. `record` exits 0 when no label repeats, 3 when one does
(a premise check comes before any patch), and 1 when a label repeats after
its premise check was recorded (stop and ask). It also exits 1, writing
nothing, for a round past the level's `maxReviewRounds` unless `allow`
recorded the operator's approval (`who`, `words`, `at`) for that exact next
round. Recording the same head again replaces that round. Each actioned comment is one fix commit, after a
test-only commit for a bug; formatting and spec updates go in the fix commit.

## Comments that ask only for a test

```text
bun "$FACTORY_ROOT/scripts/mutation-proof.ts" <repoRoot> <gate-command.json> <mutation.patch>
```

A comment that asks only for a test of behaviour that is already correct is
classified `test-gap`. It cannot go red, so it has no red gate and no operator
stop. `/address-comments` adds the test, runs the green gate, and proves the
test bites. `mutation-proof.ts` applies a minimal patch that breaks the
behaviour (never a test) to the clean worktree, requires the new test to fail
the way a red gate does, and restores the source byte for byte. It exits 0
when the test bites and 1 when it does not, and refuses a dirty worktree, an
empty patch, or a patch that touches a test. A comment that reports a real
defect is a `bug` and keeps the red gate.

## Review lens model families

```text
bun "$FACTORY_ROOT/scripts/model-catalogue.ts" second-family standard <inventory.json>
```

Each catalogue entry in `factory/model-catalogue.json` records its `family`.
`/code-review-max` asks for the first live, advertised standard model from a
different family than the usual one. When there is one, exactly one lens runs on
it instead of the usual model, so the lens count and cost stay the same. When
there is none, every lens uses the usual model. The review output lists the
model each lens used under `### Lens models`.

## Characterization pass

```text
bun "$FACTORY_ROOT/scripts/characterize.ts" check <repoRoot> <changeDir>
```

`/execute` runs this before writing the change's tests. It takes the
proposal's Impact paths and the recorded affected areas, expands them to
tracked source files, and lists in `pinned` those no test references and,
when the owner drew a zone map, referenced ones in a yellow zone, each with its
reason. A test references a
file when its own name carries the file's stem, or it names the stem as a
module. It exits 3 when anything is pinned, 0 when every planned file is
referenced and none is in a yellow zone, and 1 when the repository cannot be
read. On exit 3 the test
writer pins the listed files' current behaviour in characterization mode; those
tests must pass the green gate on the current code and are committed alone
first. The check is a file-level heuristic, not coverage.

```text
bun "$FACTORY_ROOT/scripts/characterize-measure.ts" <repoRoot> <lcov.info>
```

Measures that heuristic on a repository's archived changes. Produce the lcov
file with the test runner's coverage report first (for this pack,
`bun test --coverage --coverage-reporter=lcov` in `factory/`). For each
planned file it finds the lines the change wrote that survive today with
`git blame`, and reports false covers (called covered, none of those lines
ran), needless passes (called uncovered, some ran), and the share of those
lines that ran in files called covered. Code a test runs in a separate process
is invisible to line coverage, so such files read as unexercised. It changes no
rule.

## Branch update

```text
bun "$FACTORY_ROOT/scripts/branch-update.ts" update <worktree> <branch> <target> <expected-head>
bun "$FACTORY_ROOT/scripts/branch-update.ts" push <worktree> <branch> <expected-head>
```

Auto runs `update` when "The change has conflicts." is the only stop reason.
It needs a clean worktree with the branch checked out at the expected head,
squashes the change into one commit with its oldest message, rebases onto the
target, and force-pushes with that head as the lease. Exit 0 is updated, 3
leaves the rebase stopped with the conflicted files listed, 4 means the remote
branch moved and nothing was pushed, and 1 is any other failure. After the
`conflict-resolver` agent finishes, `push` completes with the same lease.

## Paired evaluation

```text
bun "$FACTORY_ROOT/scripts/generate-paired-evidence.ts" <paired-plan.json> <paired-evidence.json>
bun "$FACTORY_ROOT/scripts/paired-evaluation.ts" <paired-evidence.json> [paired-result.json]
```

A version 2 plan lists one entry per run in `pairs`, each with its `order`
(`baseline-first` for runs 1, 3, and 5, `candidate-first` for runs 2 and 4).
The evaluator accepts 3 or 5 runs per arm with identical controls and managed
trees, applies every quality gate to every run, and passes when the ratio of
the arms' median utilities and most runs clear 90 percent. Exit 0 passes, 1
fails or refuses (including one run per arm), and 3 is a close call: the
median ratio is within 0.05 of the bar or disagrees with the run count, so run
two more per arm. The sign-test probability in the result is diagnostic only.
A judge-scored run must carry a passing judge self-test.

```text
bun "$FACTORY_ROOT/scripts/paired-spread.ts" record <paired-evidence.json> <task-class> <paired-runs.jsonl>
bun "$FACTORY_ROOT/scripts/paired-spread.ts" report <paired-runs.jsonl>
```

`record` appends each run's baseline and candidate utilities and the decision.
`report` shows, per task class, how far one run's ratio strayed from its
evaluation's median ratio, how many evaluations the 0.05 margin extended, and
the smallest margin, rounded up to 0.01, that a single run's observed
deviation could not carry across the bar. It reports `none` without records
and never changes the margin.

## Skill size ceilings

```text
bun "$FACTORY_ROOT/scripts/skill-size.ts" check
bun "$FACTORY_ROOT/scripts/skill-size.ts" raise <skill-path>
```

Every `SKILL.md` is reread on each load, so `factory/skill-size-ceilings.json`
holds a byte ceiling per skill and `check` fails when one grows past it. Raise
a ceiling with `raise` in the same change that grows the skill, so the growth
is reviewed.

## Code map for workers

```text
bun "$FACTORY_ROOT/scripts/code-map.ts" <repoRoot> <changeDir>
```

`/execute` builds this before it dispatches the test writer and the
implementer, and passes it with `review-packet.ts --context`. It lists the
exported top-level symbols of the tracked files in the change's affected areas
(the recorded feasibility `affectedAreas` and the proposal's Impact paths),
leaving out tests, for TypeScript and JavaScript, Python, Go, Java, and Kotlin.
It is built without a model and capped at a fixed size, naming how many files
it left out. A `--context` file goes into the packet whole, under its own
heading, unlike evidence, which keeps only its tail. The holdout review packet
gets no code map.

## Comprehension memo

```text
bun "$FACTORY_ROOT/scripts/comprehension-memo.ts" write <repoRoot> <changeDir> <feasibility.json>
```

For medium or high complexity, the feasibility analyst returns a `comprehension`
memo in its verdict: entry points, callers, existing tests, and open questions,
each claim naming a repository file. `/draft` saves it as `comprehension.md` in
the change folder, keeping only claims whose file exists in the repository, and
`/execute` passes it to the test writer and implementer with `--context`. Low
complexity, or a scripted verdict with no analyst behind it, gets no memo. The
memo is never part of the spec sections a review packet carries, so the holdout
reviewer does not see it.

## Plan drift check

```text
bun "$FACTORY_ROOT/scripts/plan-drift.ts" <changeDir> <base> <head>
```

`/execute` runs this after the green gate and before the holdout review. It
compares the files the build changed (outside `openspec/`, `.delivery/`, and
`.review/`) with the paths the proposal's Impact section names in backticks and
the feasibility `affectedAreas` that `/draft` records in the change metadata
with `change-meta.ts write ... --areas '<json>'`. A changed file counts as
planned when it equals a planned path or sits under a planned folder. Test
files are expected and never drift. A low-complexity change larger than the
contained-diff limits is a size overrun. It prints the planned paths, the
unplanned files, and the reasons, and exits 0 whatever it finds; drift is
reported to the holdout reviewer and in the change description, not used to
stop the run. It exits 1 only when the metadata, proposal, or diff cannot be
read.

## Risk zones

```text
bun "$FACTORY_ROOT/scripts/risk-zones.ts" check <repoRoot> <changeDir> [ledger]
bun "$FACTORY_ROOT/scripts/risk-zones.ts" check-diff <repoRoot> <changeDir> <base> <head> [ledger]
```

The repository owner may draw an optional map at `.delivery/zones` in the main
checkout, one zone per line: `red <path or glob>` or `yellow <path or glob>`.
Lines starting with `#` are comments. A path without glob characters covers
itself and everything under it. A path in both kinds of zone counts as red.
Any other line makes the map unreadable, and every reader exits 1.

With no map, nothing changes. With a map, `diff-scan.ts` adds `zones` with the
changed paths in each kind. `/code-review-max` passes the red ones to the
fan-out as `redZones`, which runs every lens at any level. Yellow paths do not
change the review; planned files in a yellow zone get a characterization pass
(see below). `check` compares the proposal's Impact paths and the recorded
affected areas, expanded to tracked files, with the map. It exits 3 when they
reach a red zone, or name no path while a red zone exists, unless the ledger's
Approvals hold a line naming `red-zone <changeName>`; `/execute` and auto stop
there for a person. Without a ledger argument an auto worker reads the run
ledger beside its journal.

`check-diff` applies the same rule to the build's real diff after the green
gate, so a change that strays into a red zone its plan did not name stops
before the holdout review. `/delivery doctor` reports the number of zones in
each kind when a map exists, and a setup item naming the line when it cannot
be read.

## Explorer context for feasibility

```text
bun "$FACTORY_ROOT/scripts/explorer-context.ts" head <repoRoot>
bun "$FACTORY_ROOT/scripts/explorer-context.ts" find <repoRoot> <work-item.json>
```

`/groom` records `Repository head: <sha>` under each explorer session it
appends to `explorer-report.md`, using `head`. `/draft` runs `find` before it
dispatches the feasibility analyst. It looks for the one grooming folder whose
ticket draft has the work item's exact title. No match, or more than one, means
no report. A report written at the current head is fresh; one with files changed
since is stale and lists them; one with no recorded head, or a head not in
history, is stale with an unknown list. The analyst uses the report as its
starting map and re-explores what changed. The explain-back reader and the
readiness reviewer never receive it.

## Change description check

```text
bun "$FACTORY_ROOT/scripts/change-description.ts" check <create-input.json>
```

`/execute` runs this before it opens a change. The description must have one
"Decisions made for you" section and one "What the checks do not prove"
section, each with content. Decisions may say `None.` when the spec made every
choice. The second section may not, because every check leaves something
unproven. It exits 0 when both hold and 1 with the problems otherwise. The
release-readiness brief always carries the same two sections.

## Review scope

```text
bun "$FACTORY_ROOT/scripts/review-scope.ts" <repoRoot> <iid> <base-sha> <head-sha>
```

`/code-review-max` runs this before each review. It finds the last reviewed
commit from `.review/mr-<iid>/<sha>/max.md` and returns `full` or `delta`
with `since` and plain reasons. `delta` means review only
`git diff <since> <head>`, confirm each earlier finding is fixed, and judge
the approach of that change alone. Any of these makes it `full`: no earlier
review, an earlier review outside this branch's history, a missing verdict, a
merge commit since then, a sensitive surface, dependency, one-way step, or
weakened test in the change, more than 6 files or 400 lines, a file the
earlier review did not cover, or the `max` level. Release readiness always
reads the whole change.

## Review memory

```text
bun "$FACTORY_ROOT/scripts/review-memory.ts" filter <repoRoot> <iid> <head-sha> <candidates.json>
bun "$FACTORY_ROOT/scripts/review-memory.ts" record <repoRoot> <iid> <head-sha> <outcome.json>
```

`/code-review-max` remembers each candidate it disproved by reading the code,
in `.review/mr-<iid>/rejected.json`, with the reason and the code it cited.
`filter` reports, and never removes, a candidate whose cited place still holds
that code unchanged, with the remembered title and reason; the adjudicator
drops it without re-investigating only when it is the same claim, and lists it
under `### Previously disproved`. Changed code, a removed guard, or a candidate
with no line is judged afresh. `record` stores new rejections and exits 3 with
one message naming every refused item. The memory is for one merge request, lives under the
worktree-local `.review/` so a fresh clone or another runtime starts without
it, and does not track fixed findings. Deleting `rejected.json` forgets every
rejection.

## Needs validation

```text
bun "$FACTORY_ROOT/scripts/needs-validation.ts" <iid> <head> <max-pass> <ledger> <previous-max-pass>
```

A candidate whose harm depends on one fact the repository cannot show is kept
as a needs-validation item instead of being dropped. The item names that fact
and one safe check the owner can run. It carries no severity and does not block
the review, and its id comes from the file path and the fact, so it stays the
same across rounds while the fact is unchanged.

`needs-validation.ts` reads the code review pinned to the live head, the run
ledger, and the earlier review that `review-scope.json` names as `previous`
(`-` when there is none). It writes nothing. Exit 0 means no item is open. Exit
1 prints each open item. Exit 2 means the review is incomplete or unreadable,
so the command fails closed and the stage stops.

Release readiness is NO-GO while an item has no acknowledgement. Only an
Approvals line scoped to the merge request clears it, in the form the ledger
gives:

```text
- <yyyy-mm-ddThh:mm:ssZ> !<iid> — acknowledged needs-validation <id> — <who> — "<operator's words>"
```

The coordinator writes that line only from the operator's own words. A risk
acceptance and `continuous-delivery: yes` do not clear an item. An acknowledgement
records that the owner saw the fact and the check, not that the risk is gone. A
worker never reads the run ledger for this gate; it stops and reports each open
item's id, missing fact, and check.

## Approach challenge

```text
bun "$FACTORY_ROOT/scripts/draft-route.ts" approach <verdict.json> <attempt>
```

`/draft` dispatches the read-only `approach-challenger` once the spec is
written, unless feasibility rated the change low complexity. Its verdict is
`sound`, `gaps` (each becomes a scenario or a stated non-goal), or `rethink`.
A first `rethink` revises the design and challenges once more; a second
stops (exit 3) for a person to choose.

## First-pass readiness

```text
bun "$FACTORY_ROOT/scripts/draft-route.ts" readiness <verdict.json> <attempt>
```

The readiness check runs after explain-back proceeds and before artifact
verification: `/draft` dispatches the read-only `first-pass-reviewer` on the
frontier tier. It judges
the change alone, never the ticket, and answers one question: could an
implementer succeed on the first pass? An untestable scenario, a referenced
file that is neither present nor marked new, an unnamed interface, or a
contradiction with the task list each make the change not ready. A first not
ready verdict revises the change and regenerates the task list, then checks
once more; a second stops (exit 3) with the `unready-change` stop for a person.
`draft-route.ts readiness` routes the verdict and fails closed on a malformed
one. Work rated low complexity by feasibility skips the check and records the skip.

## Levels

```text
bun "$FACTORY_ROOT/scripts/levels.ts" [level]
bun "$FACTORY_ROOT/scripts/sdlc-constitution.ts" level <run-contract.json> [requested-level]
```

A level is the word after the verb or the first word: `/delivery auto max
ABC-1234`, `/delivery min ABC-5678`. It is frozen in the run contract as
`level`; a contract without one runs as `standard`. `sdlc-constitution.ts
level` prints the approved level and exits 1 when the requested one differs,
so a run changes level only through a superseding plan with a new approval.

`levels.ts` prints the presets. A level sets `maxParallelWorktrees`,
`maxFixAttempts`, `maxReviewRounds`, the review breadth that
`review-fanout.ts` applies, and the implementer tier that `select-model.ts`
applies. An explicit variable for one of the first three wins and is listed
under `overrides`. No level changes holdout, the review chain, the frontier
reviewer, every lens on a sensitive, dependency, one-way, or partly
classified change, release-readiness lenses, the land gate, fast-model
evaluation, or any human-owned decision.

`review-fanout.ts` decides which `/code-review-max` lenses to start from
measured file and line counts, reversibility, classification completeness, and
surfaces. A measured diff with no reviewable code returns no lenses. A proven small reversible change, or a contained one (reversible, at
most 6 files and fewer than 400 lines, no sensitive surface or dependency
change), returns the two essential lenses; every other input, including
incomplete classification, returns all four. The returned `lenses` array is
authoritative. `review-fanout.ts measure <base> <head>` produces the counts
from code paths only. `review-fanout.ts adjudication <candidates.json>`
returns `none` when no lens raised a candidate, `standard` when every
candidate is Low, and `main` when any is Medium or above.

The coverage check runs between the lenses and adjudication. Each lens ends
its report with the files it examined, `review-fanout.ts paths <base-or-since>
<head> [--earlier <lens-coverage.json>]` gives the brief the changed files, and
`review-fanout.ts coverage <base-or-since> <head> <input.json>
<lens-coverage.json> [--earlier <lens-coverage.json>]` finds any changed file
no lens listed. Each such file gets exactly one focused pass on the standard
model, a failed pass is named and adjudication continues, and a delta review
carries forward files an earlier review left unexamined. The lists are the
lenses' own reports, so the check shows a file was reported as examined, not
that it was read. The result is described by `review-fanout.ts`.

Release-readiness lens subagents resolve the same `standard` capability and
pass that exact identifier. `review-fanout.ts readiness` skips those
subagents on an empty or proven small reversible measured diff. The main
conversation still decides GO or NO-GO. Fast-tier models do not run those
lenses.

`diff-scan.ts` marks sensitive surfaces, one-way signals, and lowered quality
bars in a `base...head` diff from paths and changed lines, for TypeScript,
Python, and Java. Its marks are a floor for review and release readiness:
they can be added to, never removed. `--diff <file>` scans a saved diff.

`forge-comments.ts scope` records resolved, empty, acknowledgement-only,
mention-only, URL-only, and emoji-only notes, and already-applied
suggestions, as outdated. `apply-suggestion` replaces the named span of a
whole-body suggestion fence, including a `:-N+M` range, or writes nothing
and reports `model`.

`generate-tasks.ts` writes `tasks.md` from delta spec scenarios. A spec
without scenarios fails closed.

`record-skip.ts` stores each scripted skipped worker under the run id. The
scorecard counts those skips beside measured usage and never estimates
tokens saved. Skip recording does not depend on `ROUTING_PROFILING`.

`ticket-structure.ts` and `ticket-feasibility.ts` skip the draft assessor and
analyst when the ticket is complete, blocked, oversized, or names
authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a
data, schema, or database migration.

`apply-mechanical-edit.ts` applies a proven TypeScript, JavaScript, Python, Java,
Go, C#, or Kotlin rename, import-only, or format-only unit without a model. Rename
covers a unique Python parameter or local and a unique Java field, and it
moves `From.java` when a unique type matches the listed file name.
Import-only also adds a unique TypeScript, Python, Java, Go, C#, or Kotlin
missing import. Format-only uses
`node_modules/.bin/prettier`, `.venv/bin/ruff` or `venv/bin/ruff`, or
`bin/google-java-format`, `bin/csharpier`, `bin/ktfmt`, `bin/rustfmt`, `bin/php-format`, or `bin/swift-format` when that binary is
inside the repository and names and literals stay identical. A missing binary
keeps a built-in formatter where one exists; C#, Kotlin, Rust, PHP, and Swift stay on the worker
without their wrappers. Go uses its standard-library parser and formatter
helper. Rust is format-only; rename and import-only remain on the worker. PHP is
format-only too: `bin/php-format <file>` reads stdin and writes stdout, and
heredoc or nowdoc stays on the worker. Swift is format-only through
`bin/swift-format format --assume-filename <file>`.
Overloads, attributes, `exec`/`eval`, `serialVersionUID`, extract method, and
a formatter that changes names keep the worker.

`review-packet.ts` writes one Markdown packet holding the work item, every
spec file under the change directory, the diff when given, and the last 6000
characters of each evidence file. Without `--diff` it builds the test writer's
packet; an empty diff file fails, because a review needs the complete diff.

## Runtime capabilities

`runtime-manifest.json`: `process.run`, `agent.dispatch`, `model.inventory`,
`forge.change`, `tracker.item`, `review.publish`, `mutation.guard`.

## Forge command

```text
bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Operations: `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `approvals`, `create`, `set-draft`, `note`, `reply`, `land`, `failures`, `retry`. Also
`plan` and `normalize` for session-tool transport. `land` and `retry` are adapter-only: `plan`
refuses them when no executable adapter is advertised, and `normalize` never accepts them.

`approvals` takes `{ "ref": "<change>" }` and returns who approved the change
and whether every approval rule is met, at the head it read. `land` takes
`ref`, `headRevision`, `kind` (`change` or `archive`), `ticketKey`,
`ledgerPath`, `runContractPath`, `readNoteIds` (the comment ids readiness saw),
and `approved: true`. It returns `decision` `landed`, `wait`, or `stop` with
plain reasons, and exits 0, 3, or 1 to match.

`failures` takes `{ "ref": "<change>", "headRevision": "<sha>" }` and returns
the newest pipeline at that head: its id, status, kind (`merge-train`,
`merge-request`, or `branch`), and each failed job with its forge failure
reason, how many times it has run, and the end of its log. A train pipeline's
`attempt` counts the train pipelines in a row that failed for the head. When
the newest pipeline is not at the head, `pipeline` is `{ "available": false }`.

`retry` takes `ref`, `headRevision`, `ticketKey`, `runContractPath`, and
`approved: true`. It reads `failures` itself and retries only when the run
contract's `ciRetry.infrastructure` is 1, the pipeline failed, every failed job
is known infrastructure and none is a deploy job, and no job (or train) has
already been retried. Train jobs cannot be retried, so a failed train is
re-added to the merge train instead. It returns `decision` `retried` or `stop`
with plain reasons, and exits 0 or 1 to match. An adapter that does not offer
`failures` or `retry` makes the run stop for the operator.

`pipeline` takes `{ "revision": "<sha>" }` and returns evidence bound to that
exact revision. Delivery uses normalized pipeline evidence from `read` for the
open change head, then calls `pipeline` for `revisions.merged` after merge.
Evidence for a branch's latest commit or a different revision is not accepted.

## Pipeline route

```text
bun "$FACTORY_ROOT/scripts/pipeline-route.ts" '<input-json>'
```

The input identifies the change or default-branch phase, exact-revision
pipeline evidence, failure attribution, current fix attempt, maximum attempts,
and whether the repair remains inside the approved scope. The result is one of:

| Action | Meaning |
|--------|---------|
| `proceed` | The exact revision passed |
| `wait` | Evidence is not terminal or is not available yet; subscribe or resume later |
| `fix-forward` | The failure is attributable, in scope, and within budget |
| `escalate` | A human decision or provider action is required |

For an open change, fix-forward updates the existing branch and invalidates
affected gates. For a merged revision, it creates a new reviewed recovery
change. It never retries provider jobs, reverts, or writes to the default
branch.

## Session tools

`/delivery doctor` writes `.delivery/runtime/mcp-inventory.json` from the host
tools visible in the current session. `mcp-route.ts` maps those tools onto the
portable forge and work-item operations. Authenticated session tools do not
need the matching CLI binary or env token for the operations they cover.

Never call a host tool that merges, closes, approves, deletes, resolves a
thread, or transitions work-item status.

## Work-item command

```text
bun "$FACTORY_ROOT/scripts/work-item-provider.ts" \
  <list|read|create|link|note|statuses|transition> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

## Board status

```text
bun "$FACTORY_ROOT/scripts/board-status.ts" propose <repoRoot> "$FACTORY_ROOT/runtime-manifest.json" <work-item-key>
bun "$FACTORY_ROOT/scripts/board-status.ts" confirm <repoRoot> <board-map.json>
bun "$FACTORY_ROOT/scripts/board-status.ts" sync <repoRoot> "$FACTORY_ROOT/runtime-manifest.json" <work-item-key> <ready|in-progress|in-review|done>
```

`/delivery init` proposes a map from the board's columns to the four
delivery phases and confirms it with the operator. Draft syncs `ready`,
execute syncs `in-progress` and then `in-review`, and post-merge verify
syncs `done` after a verified deploy. A sync only moves a ticket forward, to
a column the confirmed map names. It skips, and the stage continues, when
there is no map, the board changed, or the ticket is already there or
further along. Closing, reopening, and backwards moves stay with people.

## Worker worktree files

```text
bun "$FACTORY_ROOT/scripts/worktree-files.ts" propose <repoRoot>
bun "$FACTORY_ROOT/scripts/worktree-files.ts" confirm <repoRoot> <worktree-files.json>
bun "$FACTORY_ROOT/scripts/worktree-files.ts" copy <repoRoot> <worktree-path>
bun "$FACTORY_ROOT/scripts/worktree-close.ts" <worktree-path> [--dry-run]
bun "$FACTORY_ROOT/scripts/worker-watch.ts" <workers-dir> <dispatch.json>
```

`/delivery init` proposes the local files git ignores (for example `.env`)
and saves only the exact paths the operator confirms. Each must be a regular
file inside the repository that git ignores and does not track, no larger than
1 MiB, and not a symbolic link. When auto creates a worker's worktree, `copy`
places those files in it, and stops that key without writing anything if one
is missing or already present. `worktree-close.ts` removes a worker's
worktree only when nothing is uncommitted or untracked and its last commit is
on a remote branch; otherwise it keeps the folder and says why.
`worker-watch.ts` reports each dispatched worker as active or idle from its
journal's last write and exits 3 when any is idle. For an idle worker,
`idle-reconcile.ts <KEY> <journal.md> <find-result.json> [green-gate.json...]`
exits 0 with the change to keep when exactly one open change exists for the
key and its head appears in the journal or under a passing green gate, and 3
otherwise. A worker is
finished when its journal row ends in a terminal status (`[go !N]`,
`[stopped: <reason>]`, or a later one) whatever its idle time; it exits 4
when none is idle but one is finished.

## Worker sandbox

```text
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" confirm <repoRoot> <sandbox.json>
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" check <repoRoot>
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" run <repoRoot> <worktree-path> <state-root> <run-id> <KEY> [--dry-run]
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" stop <repoRoot> <run-id> <KEY>
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" reap <repoRoot> <run-id>
```

The sandbox is optional. `/delivery init` saves `.delivery/sandbox.json` only
when the operator approves it: `engine` (`docker` or `podman`), a local
`image`, `network` (`none` or `open`), `env` (variable names passed through
from the coordinator, at most 50), `setup` (up to 20 argument lists run inside
the container before the worker), `worker` (an argument list that names the
ticket with `{key}`), and `approval`. `check` exits 0 when the engine is on
PATH and the image is present, 3 when no sandbox was confirmed, and 1 when a
confirmed sandbox cannot run; auto stops the fan-out on 1 rather than running
workers unsandboxed.

Every container carries the labels `delivery.run` and `delivery.key`. A
coordinator that dies leaves its workers' containers behind; `/delivery
doctor` lists any that remain, naming their run, and `reap` removes every
container labelled with that run. It exits 1 when the engine refuses to remove
one. Unlabelled containers are never touched.

`factory/scripts/sandbox-engine.test.ts` proves `reap` and the doctor listing
against a real engine when docker or podman and a local busybox or alpine image
are present, and is skipped with that reason otherwise. The `sandbox-engine` CI
job runs it against a Docker service with `DELIVERY_SANDBOX_ENGINE_TEST=required`,
so there a missing engine fails.

`run` starts one container per worker, named `delivery-<run-id>-<key>`. It
mounts the worktree and its git data read-write, the state root read-only, the
run's journal folder read-write, and the pack read-only. Inside the git data,
the shared `config`, `hooks`, and `info`, the worktree's `.git` pointer file,
and its own `commondir`, `gitdir`, and `config.worktree` are mounted read-only,
so a worker can commit but cannot plant an fsmonitor program, a hook, or a
redirect that git on the host would follow. Every git command the pack's
scripts run on a worker's worktree passes `-c core.fsmonitor=false -c
core.hooksPath=/dev/null`. `worktree-close.ts` keeps a worktree that has its
own non-empty `config.worktree` and refuses one whose git directory is outside
the repository's `worktrees` folder. It drops every Linux
capability, forbids privilege escalation, runs as the coordinator's user, and
turns networking off unless the config says `open`. The worker's commits stay
in its worktree; nothing else is copied back. The container is removed when
the worker ends, whatever its exit code. `--dry-run` prints the engine
commands instead. `stop` removes the container, which ends an idle worker's
processes. Limiting network access to listed hosts is not supported: a worker
that needs a model or forge API needs `open`.

## Provider credentials and overrides

| Provider | Credentials | Identity overrides |
|----------|-------------|--------------------|
| GitHub | `GITHUB_TOKEN`, `GH_TOKEN`, `GH_TOKEN_FILE`, `~/token` | `GH_HOST` / `GITHUB_HOST`, `GH_REPO` / `GITHUB_REPOSITORY` |
| GitLab | `GITLAB_TOKEN`, `GL_TOKEN_FILE`, `~/token` | `GL_HOST`, `GL_PROJECT` |
| Jira | `JIRA_SITE`, email+token or token file | Project key per repository: `delivery-init.ts --work-items jira --setting project=<KEY>`; MCP transport also records `--setting site=<url>` for `cloudId`. Board moves need `--setting board=<board-id>` |

## Artifacts (gitignored in the target repo)

| Path | Holds |
|------|-------|
| `.delivery/work-items.json` | Confirmed work-item provider and its per-repository settings |
| `.delivery/work-items/` | Local-files items |
| `.delivery/board-status.json` | Operator-confirmed map from board columns to delivery phases |
| `.delivery/worktree-files.json` | Operator-confirmed local files copied into each worker worktree |
| `.delivery/sandbox.json` | Operator-confirmed container settings for parallel workers |
| `.delivery/runs/` | Ledgers, run contracts, retros |
| `.delivery/workers/` | Parallel worker journals |
| `.delivery/routing/` | Model inventory and scorecards |
| `.delivery/candidates/`, `.delivery/versions/` | Skill improvement |
| `.review/` | Gates, diffs, verdicts, draft notes, and held-out samples |

## Doctor

`bun "$FACTORY_ROOT/scripts/doctor.ts"` exits 0 when **read-only lifecycle**
checks pass. An unpinned Bun version and an unverified mutation hook do not
fail that exit. Full lifecycle is a separate verdict: pinned Bun plus a
verified denial hook. Optional provider and OpenSpec gaps do not fail
read-only readiness. Init reprints only unresolved checks after it writes
configuration.
