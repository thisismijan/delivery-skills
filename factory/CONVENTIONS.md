# CLAUDE.md

Conventions for AI agents (and humans) working in the **ig-spec-driven** repository. Read this before making any change. For *what* this system is, see [`docs/spec-driven-workflow-prd.md`](docs/spec-driven-workflow-prd.md). For *how the work is sequenced*, see [`docs/superpowers/plans/0000-roadmap.md`](docs/superpowers/plans/0000-roadmap.md).

---

## Commit rules (read first)

- **Never add `Co-Authored-By` trailers.** Do not attribute commits to Claude, any AI, or any tool.
- **Never add "Generated with", "Co-authored-by", or any tool/assistant attribution** line to commit messages or MR descriptions.
- Commit messages contain only the change and its rationale, nothing else.
- **Conventional Commits** format: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Subject under 72 chars; body explains *why*.
- Commit frequently, one logical step per commit.
- **Enforced at the tool boundary.** This rule is not just prose: the plugin ships a `PreToolUse` Bash hook (`scripts/commit-guard.ts`, registered in `.claude-plugin/plugin.json`) that **blocks** any `git commit`, `git merge`, `glab mr`, or `gh pr` command whose message or description carries a `Co-Authored-By` trailer or a "Generated with Claude" line. It fires in every target repo that enables the plugin, so the orchestrator cannot attribute commits to Claude even if a prompt slips. Reads (`git log`, `grep`) are never blocked. The matcher is pure and unit-tested (`scripts/commit-guard.test.ts`); a denied commit means: remove the attribution line and re-run.

---

## Versioning (bump on every behaviour change)

The plugin version lives in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) (`version`). **Semver.** Bump it in the **same MR** as the change that warrants it, never land a behaviour change without a bump.

- **patch** (`0.3.0` → `0.3.1`): a bug fix or wording/prompt correction that does not change the command surface (e.g. fixing the draft terminal-stop loop). No new capability.
- **minor** (`0.3.0` → `0.4.0`): a new, backwards-compatible capability: a new command or subagent, a new gate/script, or a new operator-visible behaviour that does not break an existing invocation.
- **major** (`0.3.0` → `1.0.0`): a breaking change: a removed/renamed command, a changed argument contract, or any change that breaks an existing invocation or its outputs.

**When NOT to bump:** docs-only edits, test-only changes, CI/tooling, and dependency bumps that do not change behaviour. If in doubt whether a change is behavioural, bump patch.

---

## What this is

A **Claude Code plugin** that adds two operator-invoked commands to a target repository:

- **`/draft <JIRA-KEY>`**: assess the ticket, validate feasibility, author an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change, commit it to a branch, and **link it from a Jira comment** (the Atlassian MCP has no attachment tool, so the branch is the source of truth), stop.
- **`/execute <JIRA-KEY>`**: implement the spec test-first, review it with an independent Opus holdout **against the committed branch (no MR yet)**, and **only on a satisfied review open an MR ready for a human to merge**. **The factory never merges, archives, or closes. Humans do.** Running this command _is_ the approval to build.

It runs inside an interactive Claude Code session. The target repo holds `openspec/` and the code; this plugin operates on it.

## Architecture: three layers by trust

1. **Orchestration (prompts):** the two commands under `commands/` and the subagents under `agents/` (`ticket-assessor`, `feasibility-analyst`, `holdout-reviewer`). AI-driven; a human invokes the commands and decides between phases.
2. **I/O (tools):** Atlassian MCP (Jira), `git` + `glab` (GitLab: branch, MR, merge, no GitLab MCP), OpenSpec `/opsx:*`. The agents call these.
3. **Deterministic teeth (code):** small TypeScript scripts under `scripts/`: the **test gate** (runs the target repo's tests, emits structured pass/fail) and **verify-change** (OpenSpec artifact + structural checks; Zod-validated review verdict). Run on Bun, unit-tested with `bun test`.

## Hard rules

1. **Read-only MCP for reasoning.** Agents may use MCP tools to *read* (fetch tickets, related issues, code). **Writes (Jira comment, branch, MR) happen only at explicit gated steps** in the commands, never as an incidental agent action. The **holdout reviewer gets no write tools.** (The Atlassian MCP has no attachment/upload tool, so the spec is delivered as a Jira comment linking to the git branch, never as a file attachment.)
2. **Tests-first, enforced.** The red gate is a deterministic script (`scripts/test-gate.ts`): new tests must actually FAIL before any implementation. "The agent says they failed" is not acceptable. If they pass before code exists, stop + escalate.
3. **Holdout review.** The reviewer is a **fresh Opus subagent** with restricted tools that sees the ticket, the spec, the diff, the tests, and the results, never the implementer's reasoning, plan, or commit rationale.
4. **Model policy.** Sonnet by default; **review always Opus**; implementation may use Opus only with a high complexity signal **and** a recorded, non-empty justification.
5. **Verdicts are validated.** The review verdict is parsed/validated (Zod) before the approve decision; malformed → fail closed (stop + escalate).
6. **The factory never merges, archives, or closes MRs.** It creates the MR, marks it ready, and posts the review outcome. A human performs the merge (and the post-merge `/openspec-archive`). `review-route.ts` returns `approve` (not `merge`) on a satisfied review.
7. **Humans own Jira status.** MCP usage is `fetch` + `comment` only, with **no status transitions, and no attachments** (the Atlassian MCP exposes neither). The spec is linked from a comment; the git branch holds it.
8. **Fail closed.** Missing spec on disk, tests that didn't run, missing artifacts, exhausted fix attempts → stop + escalate. The happy path must be positively proven.

## Human-facing output rules (every run)

Every Jira comment, MR title, MR description, and MR note is read by a person. Write for that person.

1. **Comments explain the solution.** A factory comment is human-readable prose that explains, at a high level, what the change does and the approach it takes, not just a link or a status line. (Draft's spec-ready comment opens with a plain-language summary of the solution, then links the branch.)
2. **Never expose internal field names.** Do not paste raw verdict fields (e.g. `satisfied=yes (specFaithful, testsMeaningful, codeMatchesSpec all true)`). Render verdicts through `scripts/review-summary.ts` (`formatReviewSummary`), which emits plain-language lines with `Yes`/`No`:
   ```
   Holdout review - Satisfied

   Spec is faithful to the ticket: Yes
   Tests are meaningful: Yes
   Code matches the spec: Yes
   ```
3. **MR titles start with the Jira reference.** Build them with `scripts/mr-title.ts` (`mrTitle`), e.g. `SMAI-123 - Add new fireworks feature`.
4. **Write like a human, no em dashes.** Treat all ticket/MR/comment text as human-consumed: natural sentences, no `—`/`–`. `scripts/human-text.ts` (`sanitizeHumanText`) enforces this and `auditComment` runs every comment body through it; still write cleanly at the source.

## Test durability (durable behaviour, not migration moments)

The factory commits tests that protect **future** behaviour, never tests that pin a **point-in-time migration state**. A test that is valuable only at the moment of the change is repo bloat forever after.

- **Durable** (commit it): asserts behaviour that should hold for all future versions - a feature responds, the app renders, a contract is honoured, an invariant holds.
- **Transient** (do NOT commit it): asserts a migration moment with no future-protecting value - the absence of removed code/files/dependencies ("no React left"), the presence or shape of a file including config files (`.gitlab-ci.yml` parses / has a lint stage), or a specific error for a **deleted** route (`404` forever).

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

- **Config is the single source for knobs**: `scripts/config.ts` validates and defaults everything (`MAX_FIX_ATTEMPTS` default 2); malformed config throws (fail closed).
- **`scripts/find-change.ts` is the only change-locator**: both commands use it; **more than one match is `ambiguous` → escalate**, never guess.
- **Re-draft replaces in place**: re-running `/draft` on a key with an existing change re-proposes over the same folder, not a duplicate.
- **The complexity signal is recorded, not re-judged**: `scripts/change-meta.ts` writes the feasibility `complexitySignal` (and any opus justification) to a committed `openspec/changes/<changeName>/.ig-spec.json` during draft; `/execute` **reads** it there to pick the implementation model (`select-model.ts`) and must never re-estimate complexity itself. A missing/corrupt meta file falls back to Sonnet (no defended case → Sonnet, per PRD §9), never a guess. The signal stays out of human-facing Jira/MR text (Rule 2).
- **`assertOrEscalate` (`scripts/escalate.ts`)** is the fail-closed primitive; **all factory comments use `auditComment` (`scripts/audit.ts`)** for a consistent, greppable trail.
- **Read-only-by-construction subagents**: `ticket-assessor`, `feasibility-analyst`, and `holdout-reviewer` carry a strict tool **allowlist** `tools: Read, Grep, Glob` (NOT a `disallowedTools` denylist). An allowlist grants *only* those tools, so they have no `Bash`, no `Write`/`Edit`, and **no MCP tools**, structurally unable to author specs, run scripts, commit, or post to Jira. `test-writer`, `implementer`, and `implementer-opus` carry `tools: Read, Write, Edit, Grep, Glob`, so they may write code/tests but still have no `Bash`/MCP, meaning every git and Jira action stays with the orchestrating command. The Opus `implementer-opus` is the dispatch-model fallback for the high-complexity case. **Subagents return verdicts/edits; the command performs all I/O, never trust a subagent's narrated action.**
- **Human output goes through helpers**: `scripts/human-text.ts` (`sanitizeHumanText`, the dash stripper, wired into `auditComment`), `scripts/mr-title.ts` (`mrTitle`, Jira-ref-first), and `scripts/review-summary.ts` (`formatReviewSummary`, field-name-free verdict rendering). Each is unit-tested; the commands shell out to them rather than hand-rolling the format.
- **`scripts/chaos.test.ts`** asserts the standing guarantee: bad input (malformed verdict/config, passing red gate, ambiguous change, empty change dir, non-`yes`/escalated verdict) never yields merge/proceed.

## Running

```bash
bun install
bun test          # unit tests for scripts/
```
The commands run inside Claude Code (`/draft`, `/execute`) against a target repo with the Atlassian MCP connected and `glab` authenticated.

## Executing the plans

Deliverables N0-N6 in [`docs/superpowers/plans/`](docs/superpowers/plans/). Execute task by task. N1 (the deterministic scripts) is TDD, do not skip the "watch it fail" step.
