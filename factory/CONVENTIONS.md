# Delivery conventions

`skills/delivery/SDLC-CONSTITUTION.md` is the live policy kernel, and
`skills/delivery/sdlc-constitution.json` is its machine-readable copy. When the
two documents disagree, the constitution wins over this file. Check it with
`scripts/sdlc-constitution.ts preflight`.

This file is for the people and agents who change this repository, so read it
before you start. Policy lives in `skills/delivery/SDLC-CONSTITUTION.md`.
Operator setup and the test suite are covered by `docs/README.md` and
`CONTRIBUTING.md` in the pack root.

---

## Commits

- **No `Co-Authored-By` trailers, ever.** A commit is never credited to an AI or to any tool.
- **No attribution lines of any kind** in a commit message or a merge request description: no "Generated with", no "Co-authored-by", nothing that credits a tool or an assistant.
- A commit message holds the change and the reason for it, and nothing else.
- Use the **Conventional Commits** prefixes `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, and `test:`. Keep the subject below 72 characters and use the body to say *why*.
- Commit often, with one logical step in each commit.
- **The tool boundary enforces this.** A host adapter can install a mutation hook that runs on
  `scripts/commit-guard.ts`. Its `decideCommand` refuses attribution, merging or closing,
  force pushes, hard resets, tracker mutations, and API calls that do the same thing. The hook
  refuses a payload that carries no command. Until a runtime declares a mutation boundary it can
  enforce, its mutating stages stay blocked. Reads are never blocked. The matcher is a pure
  function with unit tests in `scripts/commit-guard.test.ts`.

---

## Versioning (every behaviour change bumps it)

The pack follows semver. The version bump goes in the **same merge request** as the change that needs it, and no behaviour change lands without one.

- **patch** (`0.3.0` → `0.3.1`): fixes a bug or corrects wording or a prompt without changing the command surface, for example repairing the loop at the draft terminal stop. It adds no capability.
- **minor** (`0.3.0` → `0.4.0`): adds a capability that stays backwards compatible, such as a new command or subagent, a new gate or script, or new behaviour an operator can see, without breaking any existing invocation.
- **major** (`0.3.0` → `1.0.0`): breaks compatibility, for example by removing or renaming a command, changing an argument contract, or changing what an existing invocation accepts or produces.

**Leave the version alone** for changes to docs only, tests only, CI or tooling, and dependency updates that do not alter behaviour. When you cannot tell whether a change alters behaviour, bump the patch number.

---

## What the pack does

This is a **delivery skill pack**. It gives a target repository two commands that an operator runs:

- **`/draft <WORK-ITEM-KEY>`** assesses the ticket, checks that it is feasible, writes an OpenSpec change, commits it to a branch, and then **posts a tracker comment that links to that branch** before stopping. The tracker provider has no attachment tool, which is why the branch is the source of truth.
- **`/execute <WORK-ITEM-KEY>`** builds the spec test-first and has an independent frontier holdout review it **against the committed branch, before any MR exists**. It **opens an MR, ready for a person to merge, only when that review is satisfied**. **Merging, archiving, and closing are human jobs that the factory never does.** Running the command _is_ the approval to build.

The pack runs inside an interactive runtime session that can load skills. The target repository holds `openspec/` and the code, and the pack works on that repository.

## Architecture: three layers, ordered by how far they are trusted

1. **Orchestration, written as prompts:** the stage skills in `skills/` and the subagents in `agents/` (`ticket-assessor`, `feasibility-analyst`, `approach-challenger`, `holdout-reviewer`, `task-profile-controller`). Models drive this layer. A person starts each command and makes the call between phases.
2. **I/O, done through tools:** the tracker provider, `git`, `scripts/forge-provider.ts` (find, read, create, note, and reply on a change), and the OpenSpec `/opsx:*` commands. The agents call these. Merging, closing, and resolving threads stay with people.
3. **Deterministic enforcement, written as code:** short TypeScript scripts in `scripts/`. The **test gate** runs the target repository's tests and prints a structured pass or fail, and **verify-change** checks the OpenSpec artifacts and their structure and validates the review verdict with Zod. They run on Bun and are covered by `bun test`.

## Non-negotiable rules

1. **Session tools only perform the portable operations.** An agent may use a host MCP tool when `forge-provider.ts plan` or `work-item-provider.ts plan` names it. Reads and gated writes still pass through those operations and then through `normalize`. Never call an unplanned host tool. Never use MCP to merge, close, approve, delete, resolve a thread, or change a work item's status; only the adapter can `land`. **The holdout reviewer has no write tools.** Because the tracker provider cannot attach or upload files, the spec reaches the tracker as a comment that links to the git branch and never as an attached file.
2. **Tests come first, and code enforces it.** The red gate is the deterministic script `scripts/test-gate.ts`, and new tests must genuinely FAIL before any implementation exists. An agent's claim that they failed does not count. When they pass before the code exists, stop and escalate.
3. **The holdout review is independent.** The reviewer is a **new frontier subagent** with limited tools. It sees the ticket, the spec, the diff, the tests, and their results, and it never sees the implementer's reasoning, plan, or commit rationale.
4. **Model choice.** The standard tier is the default. **Reviews always run on the frontier tier**, and so does the `first-pass-reviewer`. Implementation may move to the frontier tier only when the complexity signal is high **and** a non-empty justification has been recorded. The exact model identifiers come from the runtime inventory.
5. **Verdicts are validated before use.** Every subagent output is listed in `scripts/subagent-outputs.ts` as gating or advisory. A gating output is any verdict that decides where a stage goes next: assessment, feasibility, approach challenge, explain-back, readiness, holdout, comment classification, and adjudication. It is parsed and validated with Zod before anything acts on it, and when it is malformed → fail closed at once (stop + escalate), with no repair. An advisory output that is malformed, such as a review lens report, gets one repair turn: the same subagent receives the parse error and returns only its corrected output, doing no new work. A second failure fails closed. `subagent-outputs.ts policy <subagent>` prints the rule that applies, and any name missing from the list is handled as gating.
6. **The factory never closes anything or resolves a thread, and it merges only through the land gate.** It creates the draft change and posts the review outcome through `scripts/forge-provider.ts`. Outside a continuous auto run, a person does the merge. Inside one, `forge-provider.ts land` squash-merges a change only once `scripts/land-gate.ts` holds, meaning a person approved it on the forge, its pipeline passed, and readiness returned GO, all at the same head. Every factory change squashes its commits on merge. The forge provider flags the change for squashing when it creates it, and on a forge without a per-change flag the repository's default merge method is squash. On a satisfied review, `review-route.ts` returns `approve`, not `merge`. Generic skills never call a helper that belongs to one provider.
7. **Tickets only move forward, and only on the confirmed board map.** Session tools may list, read, create, link, and comment, and that is all: **no status changes and no attachments**. The one way a ticket moves is `scripts/board-status.ts sync`, which runs the adapter, refuses any column the operator-confirmed board map does not name, and never moves a ticket back. Humans own closing, reopening, deleting, and backwards moves. A comment links the spec, and the git branch holds it.
8. **Fail closed.** A spec missing from disk, tests that never ran, missing artifacts, or fix attempts that ran out all mean stop and escalate. Success has to be shown, never assumed.

## Human-facing output rules (on every run)

A person reads every tracker comment, MR title, MR description, and MR note. Write each one for that person.

1. **A comment explains the solution.** Each factory comment is prose a person can read, saying at a high level what the change does and how it goes about it, rather than a bare link or a status line. The spec-ready comment from draft starts with a plain summary of the solution and then links the branch.
2. **Internal field names stay hidden.** Never paste raw verdict fields such as `satisfied=yes (specFaithful, testsMeaningful, codeMatchesSpec all true)`. Render a verdict with `formatReviewSummary` from `scripts/review-summary.ts`, which prints plain-language lines answered `Yes` or `No`, followed by any findings:
   ```
   Holdout review - Changes requested

   Spec is faithful to the ticket: No
   Tests are meaningful: Yes
   Code matches the spec: No
   Code is ready for main: No

   Outstanding findings:
   - The spec leaves out the export limit the ticket asks for.
   ```
3. **An MR title begins with the work-item reference.** Build it with `mrTitle` from `scripts/mr-title.ts`, which gives titles such as `XYZ-123 - Add new fireworks feature`.
4. **Write as a person would, without em dashes.** All ticket, MR, and comment text is read by people, so use ordinary sentences and no `—` or `–`. `sanitizeHumanText` in `scripts/human-text.ts` enforces this, and `auditComment` passes every comment body through it, but write cleanly in the first place anyway.

## Test durability (durable behaviour, never a migration moment)

The factory commits tests that guard **future** behaviour. It never commits a test that pins a **point-in-time migration state**, because a test that only matters at the moment of the change is dead weight in the repository from then on.

- **Durable**, so commit it: the test checks behaviour that should keep holding in every later version, such as a feature responding, the app rendering, a contract being honoured, or an invariant holding.
- **Transient**, so do NOT commit it: the test checks a migration moment and protects nothing afterwards, such as removed code, files, or dependencies being absent ("no React left"), a file, config files included, being present or having a certain shape (a CI config file parses, or has a lint stage), or a **deleted** route returning a fixed error (`404` forever).

How each stage applies the rule:

- **Draft** writes acceptance criteria and their scenarios as the intended **steady-state behaviour**, never as the old thing being gone. For a removal, the durable coverage is *deleting the existing tests of the removed behaviour*, not adding a test that something no longer exists. For a migration, assert the new steady state.
- **`test-writer`** writes one durable test per scenario. When a scenario is inherently transient and has **no durable behavioural form**, it **skips it and reports** the scenario and the reason instead of committing a test about existence, absence, or config shape. Every real *functional-behaviour* scenario still gets a test. Skipping is only for point-in-time assertions and is never a way out.
- **`holdout-reviewer`** fails `testsMeaningful` for a test that only pins a migration moment, and checks the skip list both ways: a committed transient test is a finding, and so is a skipped scenario that *had* a durable form.
- **`execute`** shows the skip list to the human in the MR description, so a skip is never dropped quietly.

The same rubric is written into `skills/draft/SKILL.md`, `agents/test-writer.md`, `agents/holdout-reviewer.md`, and `skills/execute/SKILL.md`, because a subagent sees only its own prompt and cannot read a shared file at runtime. Keep those copies in line with this definition.

## Comment discipline (code that explains itself, not code with notes on it)

The factory's writing agents write **no comment** unless one is truly needed. Generated code tends to pile up commentary, and a comment that repeats the code costs something forever: it makes reading noisier and goes wrong as soon as the line beneath it changes.

**Hard limits.** Asking of each line whether it explains why is not enough by itself, because a long block can pass that test line by line and still be noise. So a comment runs to **one or two lines** and sits on the line it is about. It is **never** a block longer than the code it describes, and **never** a header at the top of a file.

Do not write any of these:

- **Comments that repeat the code:** narrating control flow (`// exit 0 -> continue, non-zero -> escalate`), section labels (`// helper functions below`), step markers on an obvious sequence, or a comment that restates a test's name.
- **Text copied from the spec, the design, or a contract.** The spec is the source of truth, and a comment that paraphrases it drifts away unnoticed. That rules out acceptance criteria, decision rules, and prose outlines of an interface that belongs in the types (the "seam contract this file assumes" kind of preamble). **One line naming the spec file** is the most a comment may say about it.
- **History:** ticket keys, task numbers, MR or review-comment ids, "regression tests for the MR !8 comments", "as decided in ...", "not yet implemented", "new: added retry", or "previously this used X". The commit message, the MR, and `git blame` hold the history, and the file holds the behaviour.

A comment is written only where a reader would otherwise ask **why** and the code cannot answer: a constraint that is not obvious, a deliberate departure from the obvious approach, a workaround with its reason, an ordering requirement or invariant that is easy to miss, or, in a test, a fixture or magic value whose origin is not obvious.

- Choose a clearer name, a named constant, or a smaller function before writing a comment to explain a confusing line. In a test, put the scenario **in the test name**.
- Doc comments on exported symbols (JSDoc, TSDoc, docstrings) are allowed where the target repository already writes them, limited to what the signature cannot say. The rule is about inline noise, not documented public APIs.
- Agents match how densely the **target repository** already comments, never exceed it, and leave existing comments alone in code they are not otherwise changing.

The same rubric is written into `agents/implementer.md`, `agents/implementer-opus.md`, and `agents/test-writer.md`, the agents that can write. Keep those copies in line with this definition.

Unlike test durability, this rubric is **on purpose not a review gate**. `holdout-reviewer` does not judge how many comments there are, and `readyForMain` must still never fail because of style. Comment noise is guidance for the agents that write code, not a reason to send an MR back.

## Writing commands, subagents, and scripts

- **Stage skills** (`skills/*/SKILL.md`) have clear front-matter and a numbered, deterministic procedure for the main agent to follow. Each step names the exact tool, script, or subagent it uses, and the routing (clarify, escalate, or proceed) and the gates are written out.
- **Subagents** (`agents/*.md`) each own one responsibility, hold the smallest tool allow-list that works, and say so when they are read-only. The holdout reviewer's prompt lists what it must NOT read.
- **Scripts** (`scripts/*.ts`) are strict TypeScript, kept small and pure where possible, print structured JSON, and have unit tests. They use no provider SDK and instead shell out to the agent's tools or CLIs.

## Hardening (N6)

- **Every knob comes from config:** `scripts/config.ts` validates each setting and supplies its default (`MAX_FIX_ATTEMPTS` default 2, `MAX_PARALLEL_WORKTREES` default 4, `MAX_REVIEW_ROUNDS` default 3, `WORKER_IDLE_MINUTES` default 20, `ROUTING_PROFILING` default `off`), and malformed config throws, so it fails closed. `DELIVERY_LEVEL` (`min`, `standard`, or `max`, from `scripts/levels.ts`) fills in the first three when they are unset, and also sets review breadth and the implementer tier. The `standard` level gives exactly these defaults.
- **Only `scripts/find-change.ts` locates a change.** Both commands call it, and **more than one match means `ambiguous`, which escalates** instead of guessing.
- **Skill files have a size ceiling.** A skill's `SKILL.md` is loaded whole when the skill starts, so `factory/skill-size-ceilings.json` holds a ceiling for each one, and `skill-size.test.ts` fails, naming the skill, when a skill outgrows its ceiling or has none. Trim the skill, or raise its ceiling on purpose with `skill-size.ts raise <skill-path>` in the same change so reviewers can see the growth.
- **`scripts/generate-tasks.ts` writes `tasks.md`.** `/draft` writes the proposal, the specs, and the design, then generates one test task for each spec scenario plus the implementation tasks. A spec without scenarios fails closed.
- **A re-draft replaces the change where it is.** Running `/draft` again on a key that already has a change proposes over the same folder instead of making a second one.
- **The complexity signal is recorded once and never judged again.** During draft, `scripts/change-meta.ts` writes the feasibility `complexitySignal`, and any frontier justification, into the committed change metadata file. `/execute` **reads** it from there to choose the implementation model (`select-model.ts`) and never estimates complexity itself. A missing or corrupt metadata file falls back to the standard tier, since no defended case means standard, and never to a guess. The signal never appears in tracker or merge-request text meant for people (Rule 2).
- **Shadow routing never dispatches.** Diagnostic profiling is opt-in (`ROUTING_PROFILING=always`). When it is on, the read-only frontier `task-profile-controller` emits each `TaskProfile`. The exact models the host advertises are saved to `.delivery/routing/model-inventory.json`, and `scripts/model-catalogue.ts` maps a required tier to an available model (Muse Wonder counts for frontier) without lowering the tier. `scripts/shadow-route.ts` records the cheapest qualified tier once the deterministic floors are applied. `scripts/record-routing.ts` saves observations under `.delivery/routing/`, covering gate outcomes, repairs, escalations, and usage. `scripts/record-skip.ts` records every scripted skipped worker even with profiling off, and the run scorecard counts those skips and never estimates tokens saved. Live capability still comes from `select-model.ts`. A cheaper shadow recommendation never picks a worker until `fast-dispatch.ts` reports that the exact candidate has cleared the 90 percent bar on reversible, strongly verified work. With profiling off, only the controller and its observation telemetry are skipped.
- **Review fan-out is deterministic.** `/code-review-max` lenses, which are adjudicated independently, use the resolved standard-tier model. `scripts/review-fanout.ts` picks no lenses when the measured diff holds no reviewable code, the two essential lenses for a change proven small and reversible or contained, and all four otherwise, and it refuses malformed input. Its `measure` mode counts only code, ignoring OpenSpec and delivery artefacts. Its `adjudication` mode keeps candidates rated Medium or higher in the main conversation, gives an all-Low set to one standard-tier subagent, and skips verification when there are no candidates. Its `paths` and `coverage` modes run the coverage check between the lenses and adjudication: each changed file must be reported as examined, either by a lens or by one focused pass on the standard model, a failed pass is named while adjudication goes on, and a delta review carries forward the files still unexamined. Those lists are the lenses' own reports, so the check proves a file was reported as examined, not that anyone read it.
- **Needs-validation items are kept, never dropped or guessed at.** `scripts/needs-validation.ts` reads the pinned code review and exits 1 while any item lacks a ledger acknowledgement, and 2 when the review is incomplete or cannot be read, so it fails closed. An item clears only through an Approvals line `acknowledged needs-validation <id>` scoped to that merge request, and no worker reads the ledger for it.
- **Review memory belongs to one merge request.** `scripts/review-memory.ts` stores disproved candidates in `.review/mr-<iid>/rejected.json`. `filter` reports and never removes, and `record` exits 3 when it refuses items.
- **Release-readiness lens subagents use the same standard model.** The rollback, compatibility, security, and operability lenses take the exact identifier that `model-catalogue.ts resolve standard` returns. `scripts/review-fanout.ts readiness` skips those subagents when the measured diff is empty or proven small and reversible, and the main conversation still reaches GO or NO-GO itself. Fast-tier models never run those lenses.
- **Mechanical edits are applied by script, not described by a worker.** `scripts/mechanical-edit.ts` classifies a bounded rename, import-only, or format-only unit, and `scripts/apply-mechanical-edit.ts` rewrites proven TypeScript, JavaScript, Python, Java, Go, C#, and Kotlin files with no worker involved. That covers a unique Python parameter or local, a unique Java field, a `From.java` file name that matches, a unique missing import in TypeScript, Python, Java, Go, C#, or Kotlin, and a repo-local Prettier, Ruff, or google-java-format binary, the Go standard formatter, or a repo-local `bin/csharpier`, `bin/ktfmt`, `bin/rustfmt`, `bin/php-format`, or `bin/swift-format`, as long as names and literals stay the same. Anything the script cannot prove stays with the implementer. The green gate, lint, the type check, and the holdout still run.
- **Surfaces and lowered bars are found by scanning, not reading.** `scripts/diff-scan.ts` works from paths and changed lines in TypeScript, Python, and Java. It marks the Data, Contract, Config, Auth, Infra, Dependencies, and User-facing surfaces, one-way signals from destructive SQL, and lowered-bar hits: deleted or skipped tests, assertions removed on balance, lowered thresholds, new suppressions, and not-implemented stubs. `/code-review-max` and release readiness begin from its output. The marks are a floor, so the model may add a mark it can prove and never remove one. A diff it cannot read makes it exit non-zero, which stops the stage.
- **`assertOrEscalate` in `scripts/escalate.ts`** is the basic fail-closed building block, and **every factory comment goes through `auditComment` in `scripts/audit.ts`**, which keeps a consistent trail that is easy to grep.
- **Read-only subagents.** `ticket-assessor`, `feasibility-analyst`, `approach-challenger`, `first-pass-reviewer`, `holdout-reviewer`, and `task-profile-controller` declare the strict tool **allowlist** `tools: Read, Grep, Glob`, NOT a `disallowedTools` denylist. An allowlist grants those tools *and nothing else*, so these agents have no `Bash`, no `Write`/`Edit`, and **no MCP tools**, and they cannot author a spec, run a script, commit, or post to the tracker by their very structure. `test-writer`, `implementer`, and `implementer-opus` declare `tools: Read, Write, Edit, Grep, Glob`, so they can write code and tests but still have no `Bash` or MCP, and every git and tracker action stays with the command running them. `implementer-opus`, on the frontier tier, is the fallback dispatch model for high-complexity work. **Subagents hand back verdicts or edits, the command does all of the I/O, and a subagent's description of an action it took is never trusted.**
- **First-pass readiness comes between explain-back and verification.** Once explain-back proceeds, `/draft` dispatches the read-only frontier `first-pass-reviewer`, which looks at the change by itself and answers one question: could an implementer get it right on the first pass? `scripts/draft-route.ts readiness` routes its verdict. A not-ready verdict gets one revision, with `tasks.md` generated again, and after that the route stops with exit 3 and the `unready-change` stop for a person. When feasibility rated the work low complexity, the check is skipped and the skip is recorded under the worker name `first-pass-reviewer`.
- **Text for people goes through helpers.** `scripts/human-text.ts` provides `sanitizeHumanText`, the dash remover that `auditComment` calls. `scripts/mr-title.ts` provides `mrTitle`, which puts the work-item reference first. `scripts/review-summary.ts` provides `formatReviewSummary`, which renders a verdict without field names. Each has unit tests, and the commands shell out to them instead of building the format by hand.
- **`scripts/chaos.test.ts`** checks the standing guarantee that bad input never leads to a merge or a proceed. Bad input here means a malformed verdict or config, a red gate that passes, an ambiguous change, an empty change directory, or a verdict that is not `yes` or that escalates.

## Running it

```bash
bun install
bun run test      # unit tests for scripts/, then the delivery skill checks
```

The commands (`/draft`, `/execute`) run inside a runtime that can load skills, against a target repository with the tracker and forge providers connected.
