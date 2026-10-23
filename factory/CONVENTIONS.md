# Delivery conventions

The live policy kernel is `skills/delivery/SDLC-CONSTITUTION.md` (machine copy
`skills/delivery/sdlc-constitution.json`). It outranks this file where they
disagree. Verify with `scripts/sdlc-constitution.ts preflight`.

Conventions for agents and humans working in this repository. Read this before
making a change. For policy, see `skills/delivery/SDLC-CONSTITUTION.md`. For
operator setup and tests, see `docs/README.md` and `CONTRIBUTING.md` at the
pack root.

---

## Commit rules (read first)

- **Never add `Co-Authored-By` trailers.** Do not attribute commits to any AI, or any tool.
- **Never add "Generated with", "Co-authored-by", or any tool/assistant attribution** line to commit messages or MR descriptions.
- Commit messages contain only the change and its rationale, nothing else.
- **Conventional Commits** format: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Subject under 72 chars; body explains *why*.
- Commit frequently, one logical step per commit.
- **Enforced at the tool boundary.** A host adapter may install a mutation hook backed by
  `scripts/commit-guard.ts`. `decideCommand` blocks attribution plus merge/close,
  force-push, hard reset, tracker mutation, and equivalent API calls. The hook
  denies a payload with no command. A runtime that does not declare an enforceable
  mutation boundary keeps mutating stages blocked until a real hook exists. Reads are never blocked. The
  matcher is pure and unit-tested (`scripts/commit-guard.test.ts`).

---

## Versioning (bump on every behaviour change)

The pack version is semver. Bump it in the **same merge request** as the change that warrants it, never land a behaviour change without a bump.

- **patch** (`0.3.0` → `0.3.1`): a bug fix or wording/prompt correction that does not change the command surface (e.g. fixing the draft terminal-stop loop). No new capability.
- **minor** (`0.3.0` → `0.4.0`): a new, backwards-compatible capability: a new command or subagent, a new gate/script, or a new operator-visible behaviour that does not break an existing invocation.
- **major** (`0.3.0` → `1.0.0`): a breaking change: a removed/renamed command, a changed argument contract, or any change that breaks an existing invocation or its outputs.

**When NOT to bump:** docs-only edits, test-only changes, CI/tooling, and dependency bumps that do not change behaviour. If in doubt whether a change is behavioural, bump patch.

---

## What this is

A **delivery skill pack** that adds two operator-invoked commands to a target repository:

- **`/draft <WORK-ITEM-KEY>`**: assess the ticket, validate feasibility, author an OpenSpec change, commit it to a branch, and **link it from a tracker comment** (the tracker provider has no attachment tool, so the branch is the source of truth), stop.
- **`/execute <WORK-ITEM-KEY>`**: implement the spec test-first, review it with an independent frontier holdout **against the committed branch (no MR yet)**, and **only on a satisfied review open an MR ready for a human to merge**. **The factory never merges, archives, or closes. Humans do.** Running this command _is_ the approval to build.

It runs inside an interactive skill-capable runtime session. The target repo holds `openspec/` and the code; this pack operates on it.

## Architecture: three layers by trust

1. **Orchestration (prompts):** the two commands under `commands/` and the subagents under `agents/` (`ticket-assessor`, `feasibility-analyst`, `holdout-reviewer`, `task-profile-controller`). AI-driven; a human invokes the commands and decides between phases.
2. **I/O (tools):** tracker provider, `git`, and `scripts/forge-provider.ts` (change find/read/create/note/reply). OpenSpec `/opsx:*`. The agents call these. Humans own merge, close, and thread resolution.
3. **Deterministic teeth (code):** small TypeScript scripts under `scripts/`: the **test gate** (runs the target repo's tests, emits structured pass/fail) and **verify-change** (OpenSpec artifact + structural checks; Zod-validated review verdict). Run on Bun, unit-tested with `bun test`.

## Hard rules

1. **Session tools stay on the portable operations.** Agents may use host MCP tools when `forge-provider.ts plan` or `work-item-provider.ts plan` names them. Reads and gated writes still go through those operations, then `normalize`. Never call an unplanned host tool. Never merge, close, approve, delete, resolve threads, or transition work-item status through MCP. The **holdout reviewer gets no write tools.** (The tracker provider has no attachment/upload tool, so the spec is delivered as a tracker comment linking to the git branch, never as a file attachment.)
2. **Tests-first, enforced.** The red gate is a deterministic script (`scripts/test-gate.ts`): new tests must actually FAIL before any implementation. "The agent says they failed" is not acceptable. If they pass before code exists, stop + escalate.
3. **Holdout review.** The reviewer is a **fresh frontier subagent** with restricted tools that sees the ticket, the spec, the diff, the tests, and the results, never the implementer's reasoning, plan, or commit rationale.
4. **Model policy.** Standard tier by default; **review always frontier**; implementation may use frontier only with a high complexity signal **and** a recorded, non-empty justification. The runtime inventory supplies the exact identifiers.
5. **Verdicts are validated.** The review verdict is parsed/validated (Zod) before the approve decision; malformed → fail closed (stop + escalate).
6. **The factory never merges, archives, closes, or resolves threads.** It creates the draft change and posts the review outcome through `scripts/forge-provider.ts`. A human performs the merge (and the post-merge `/openspec-archive`). `review-route.ts` returns `approve` (not `merge`) on a satisfied review. Generic skills never call a provider-native helper.
7. **Humans own tracker status.** Session-tool usage is list/read/create/link/comment only, with **no status transitions, and no attachments** (the tracker provider exposes neither). The spec is linked from a comment; the git branch holds it.
8. **Fail closed.** Missing spec on disk, tests that didn't run, missing artifacts, exhausted fix attempts → stop + escalate. The happy path must be positively proven.

## Human-facing output rules (every run)

Every tracker comment, MR title, MR description, and MR note is read by a person. Write for that person.

1. **Comments explain the solution.** A factory comment is human-readable prose that explains, at a high level, what the change does and the approach it takes, not just a link or a status line. (Draft's spec-ready comment opens with a plain-language summary of the solution, then links the branch.)
2. **Never expose internal field names.** Do not paste raw verdict fields (e.g. `satisfied=yes (specFaithful, testsMeaningful, codeMatchesSpec all true)`). Render verdicts through `scripts/review-summary.ts` (`formatReviewSummary`), which emits plain-language lines with `Yes`/`No`:
   ```
   Holdout review - Satisfied

   Spec is faithful to the ticket: Yes
   Tests are meaningful: Yes
   Code matches the spec: Yes
   ```
3. **MR titles start with the work-item reference.** Build them with `scripts/mr-title.ts` (`mrTitle`), e.g. `SMAI-123 - Add new fireworks feature`.
4. **Write like a human, no em dashes.** Treat all ticket/MR/comment text as human-consumed: natural sentences, no `—`/`–`. `scripts/human-text.ts` (`sanitizeHumanText`) enforces this and `auditComment` runs every comment body through it; still write cleanly at the source.

## Test durability (durable behaviour, not migration moments)

The factory commits tests that protect **future** behaviour, never tests that pin a **point-in-time migration state**. A test that is valuable only at the moment of the change is repo bloat forever after.

- **Durable** (commit it): asserts behaviour that should hold for all future versions - a feature responds, the app renders, a contract is honoured, an invariant holds.
- **Transient** (do NOT commit it): asserts a migration moment with no future-protecting value - the absence of removed code/files/dependencies ("no React left"), the presence or shape of a file including config files (a CI config file parses / has a lint stage), or a specific error for a **deleted** route (`404` forever).

The rule at each stage:
- **Draft** authors acceptance criteria (and their scenarios) as intended **steady-state behaviour**, not the absence of the old thing. For a removal, the durable coverage is *deleting the removed behaviour's existing tests*, not adding a negative-existence test; for a migration, assert the new steady state.
- **`test-writer`** writes a durable test per scenario. If a scenario is inherently transient with **no durable behavioural form**, it **skips and reports** the scenario with a reason rather than committing an existence/absence/config-shape test. Every genuine *functional-behaviour* scenario must still be tested - skipping is only for point-in-time assertions, never an escape hatch.
- **`holdout-reviewer`**'s `testsMeaningful` fails a test that only pins a migration moment, and polices the skip list in both directions: a transient test committed is a finding, and a scenario skipped that *had* a durable form is a finding.
- **`execute`** surfaces the skip list to the human (MR description); skips are never silently dropped.

This rubric is inlined into `commands/draft.md`, `agents/test-writer.md`, `agents/holdout-reviewer.md`, and `commands/execute.md` (subagents see only their own prompt, so it cannot live in one shared file read at runtime). Keep those copies in sync with this definition.

## Comment discipline (self-documenting code, not annotated code)

The factory's writing agents default to **no comment**. Generated code drifts toward heavy commentary, and a comment that restates the code is a permanent cost: it adds reading noise and rots the moment the line below it changes.

**Hard limits** (a per-line "is this explaining why?" test is not enough on its own - a long block can pass it line by line and still be noise): a comment is **one or two lines**, at the line it applies to; **never** a block comment longer than the code it documents; **never** a file-header preamble.

Never written:
- **Restatements of the code**: control-flow narration (`// exit 0 -> continue, non-zero -> escalate`), structural labels (`// helper functions below`), step labels on an obvious flow, or a comment repeating a test's name.
- **Spec, design, or contract text copied into a comment.** The spec is the source of truth; a comment paraphrasing it silently diverges from it. No acceptance criteria, no decision rules, no prose sketch of an interface that belongs in types (the "seam contract this file assumes" preamble). At most **one line naming the spec file**.
- **Provenance**: ticket keys, task numbers, MR or review-comment ids, "regression tests for the MR !8 comments", "as decided in ...", "not yet implemented", "new: added retry", "previously this used X". The commit message, the MR, and `git blame` carry the history; the file carries the behaviour.

Written only where a reader would otherwise ask **why** and the code cannot answer: a non-obvious constraint, a deliberate deviation from the obvious approach, a workaround with its reason, a subtle ordering requirement or invariant, or (in tests) a non-obvious fixture or magic value.

- Prefer a clearer name, an extracted constant, or a smaller function over a comment explaining a confusing line. In tests, put the scenario **in the test name**.
- Doc comments on exported symbols (JSDoc/TSDoc/docstrings) are exempt where the target repo already uses them, limited to what the signature cannot say. This is about inline noise, not documented public APIs.
- Agents match the **target repo's** existing comment density and never exceed it, and they do not strip existing comments from code they were not otherwise changing.

Inlined into `agents/implementer.md`, `agents/implementer-opus.md`, and `agents/test-writer.md` (the write-capable agents). Keep those copies in sync with this definition.

Unlike test durability, this rubric is **deliberately not a review gate**: `holdout-reviewer` does not judge comment density, and `readyForMain` still must never fail on style. Comment noise is guidance for the writing agents, not grounds for bouncing an MR.

## Authoring conventions

- **Commands** (`commands/*.md`): a clear front-matter + a numbered, deterministic orchestration the main agent follows; name the exact tools/scripts/subagents each step uses; spell out routing (clarify / escalate / proceed) and the gates.
- **Subagents** (`agents/*.md`): one responsibility each; minimal tool allow-list; state read-only where applicable; the holdout reviewer's prompt enumerates what it must NOT read.
- **Scripts** (`scripts/*.ts`): TypeScript, strict, small, pure where possible; structured (JSON) output; unit-tested; no provider SDKs (they shell out to the agent's tools / CLIs).

## Hardening (N6)

- **Config is the single source for knobs**: `scripts/config.ts` validates and defaults everything (`MAX_FIX_ATTEMPTS` default 2, `MAX_PARALLEL_WORKTREES` default 4, `ROUTING_PROFILING` default `off`); malformed config throws (fail closed).
- **`scripts/find-change.ts` is the only change-locator**: both commands use it; **more than one match is `ambiguous` → escalate**, never guess.
- **Re-draft replaces in place**: re-running `/draft` on a key with an existing change re-proposes over the same folder, not a duplicate.
- **The complexity signal is recorded, not re-judged**: `scripts/change-meta.ts` writes the feasibility `complexitySignal` (and any frontier justification) to the committed change metadata file during draft; `/execute` **reads** it there to pick the implementation model (`select-model.ts`) and must never re-estimate complexity itself. A missing/corrupt meta file falls back to the standard tier (no defended case → standard), never a guess. The signal stays out of human-facing tracker or merge-request text (Rule 2).
- **Shadow routing does not dispatch**: diagnostic profiling is opt-in (`ROUTING_PROFILING=always`). When enabled, `task-profile-controller` (frontier, read-only) emits each `TaskProfile`. The host's exact advertised models are persisted to `.delivery/routing/model-inventory.json`; `scripts/model-catalogue.ts` resolves a required tier to an available model (including Muse Wonder for frontier) without lowering that tier. `scripts/shadow-route.ts` records the cheapest qualified tier after deterministic floors. `scripts/record-routing.ts` persists observations under `.delivery/routing/`, including gate outcomes, repairs, escalations, and usage. Live capability still comes from `select-model.ts`. A cheaper shadow recommendation never selects a worker until `fast-dispatch.ts` reports that the exact candidate on reversible, strongly verified work has cleared the 90 percent bar. With profiling off, skip the controller and its telemetry only.
- **Review fan-out is deterministic**: independently adjudicated `/code-review-max` lenses use the resolved standard-tier model. `scripts/review-fanout.ts` chooses two essential lenses for a proven small reversible or contained change and all four otherwise, and refuses malformed input. Its `measure` mode counts code only, leaving out OpenSpec and delivery artefacts, and its `adjudication` mode keeps the main conversation for candidates at Medium or above, hands all-Low candidates to one standard-tier subagent, and skips verification when there are none.
- **`assertOrEscalate` (`scripts/escalate.ts`)** is the fail-closed primitive; **all factory comments use `auditComment` (`scripts/audit.ts`)** for a consistent, greppable trail.
- **Read-only-by-construction subagents**: `ticket-assessor`, `feasibility-analyst`, `holdout-reviewer`, and `task-profile-controller` carry a strict tool **allowlist** `tools: Read, Grep, Glob` (NOT a `disallowedTools` denylist). An allowlist grants *only* those tools, so they have no `Bash`, no `Write`/`Edit`, and **no MCP tools**, structurally unable to author specs, run scripts, commit, or post to the tracker. `test-writer`, `implementer`, and `implementer-opus` carry `tools: Read, Write, Edit, Grep, Glob`, so they may write code/tests but still have no `Bash`/MCP, meaning every git and tracker action stays with the orchestrating command. The frontier `implementer-opus` is the dispatch-model fallback for the high-complexity case. **Subagents return verdicts/edits; the command performs all I/O, never trust a subagent's narrated action.**
- **Human output goes through helpers**: `scripts/human-text.ts` (`sanitizeHumanText`, the dash stripper, wired into `auditComment`), `scripts/mr-title.ts` (`mrTitle`, work-item-ref-first), and `scripts/review-summary.ts` (`formatReviewSummary`, field-name-free verdict rendering). Each is unit-tested; the commands shell out to them rather than hand-rolling the format.
- **`scripts/chaos.test.ts`** asserts the standing guarantee: bad input (malformed verdict/config, passing red gate, ambiguous change, empty change dir, non-`yes`/escalated verdict) never yields merge/proceed.

## Running

```bash
bun install
bun test          # unit tests for scripts/
```
The commands run inside a skill-capable runtime (`/draft`, `/execute`) against a target repo with the tracker and forge providers connected.

## Executing the plans

Deliverables N0-N6 in [`docs/superpowers/plans/`](docs/superpowers/plans/). Execute task by task. N1 (the deterministic scripts) is TDD, do not skip the "watch it fail" step.
