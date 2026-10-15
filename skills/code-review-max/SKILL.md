---
name: code-review-max
description: Deep first-pass correctness review of a GitLab merge request. Pins the MR head, fans out independent read-only review lenses, verifies every candidate against the code, and leaves stamped findings for mr-review. Use when the user types /code-review-max, asks for the maximum review pass, or /delivery review needs its correctness pass in Cursor.
disable-model-invocation: true
argument-hint: "[!MR-iid | MR-iid]"
---

# Code review max

Target: `$ARGUMENTS`

This is the correctness pass. It finds bugs, security issues, behavioural
regressions, reliability failures, and missing tests. It does not judge whether
the author chose the best overall approach; `mr-review` does that second.

Run inline in the conversation that will run `mr-review`. Review subagents
report to this conversation; they do not publish anything.

## Preconditions

Stop at the first failure:

1. Parse `$ARGUMENTS` as an MR iid, accepting `840` or `!840` and nothing else.
2. `gl-mr <iid> meta`, `gl-mr <iid> refs`, `gl-mr <iid> changes`, and
   `gl-mr <iid> diff` all succeed. If `gl-mr` reports overflow or truncation,
   stop. Never review a partial diff.
3. Read the exact head and base SHAs from `gl-mr <iid> refs`. Fetch both without
   checking either out. The current branch is irrelevant.
4. Read the MR description and commits. Identify the requirement from the MR,
   linked ticket, and OpenSpec change. If none says what the change is meant to
   do, report that as a blocking review-input failure and stop.

State: `Reviewing !<iid> at <full-head-sha> against <full-base-sha>.`

## Build the review brief

Give every reviewer the same immutable brief:

- MR iid, full base SHA, full head SHA.
- Requirement and acceptance criteria, quoted with their source.
- Changed paths.
- Repository rules and the commands CI runs.
- Instructions to inspect any caller, schema, migration, configuration, or test
  outside the diff that is needed to prove a claim.
- The severity and evidence rules below.

Do not give reviewers the MR author's reasoning as evidence. A statement in the
MR description is a claim to verify.

## Parallel review

Start four fresh read-only subagents in one parallel batch. They may use read,
search, and read-only git commands. They must not edit, comment, post, commit,
or push.

1. **Correctness and security**
   - Trace changed control and data flow.
   - Check boundary validation, authentication and authorization, secrets,
     injection, unsafe defaults, and contract compatibility.
2. **Tests and specification**
   - Map every acceptance criterion and changed behaviour to an executed test.
   - Check that tests would fail on the likely incorrect implementations.
   - Look for skipped, deleted, weakened, tautological, or implementation-coupled
     tests.
3. **Reliability and operations**
   - Check failure paths, retries, idempotency, partial completion, concurrency,
     resource cleanup, migrations, rollout compatibility, observability, and
     rollback.
4. **Repository standards and blast radius**
   - Apply the repository's actual rules.
   - Trace callers and consumers outside the diff.
   - Check types, browser/server boundaries, generated artifacts, configuration,
     CI selection, and dependency changes.

Each candidate finding must contain:

- Severity: `Critical`, `High`, `Medium`, or `Low`.
- `path:line` at the head SHA.
- The concrete bad behaviour.
- A reproducible input, sequence, or failure condition.
- Evidence from code, a test, or a command.
- The smallest reasonable fix direction.
- Which requirement or repository rule it violates.

Reviewers return `NO FINDINGS` when they have none. They do not include praise,
style preferences, or speculative future requirements.

## Adjudicate every candidate

The main conversation owns the verdict. For every candidate:

1. Read the cited code at the pinned head and enough surrounding code to verify
   the claim.
2. Confirm the line exists in the head diff or explain why an unchanged line is
   the correct anchor.
3. Run the cheapest focused test or reproduction when practical.
4. Search for an existing guard that clears the risk.
5. Drop duplicates and anything already raised in the MR discussions.
6. Drop claims that depend only on a name, comment, or reviewer assertion.
7. Downgrade or drop a finding whose impact or trigger cannot be shown.

No candidate is a finding merely because several reviewers repeated it.

## Severity

- **Critical**: exploitable security issue, irreversible data loss/corruption,
  or a change that cannot safely ship.
- **High**: a likely user-visible regression, authorization failure, contract
  break, broken migration/rollback, or failure of a primary path.
- **Medium**: a real bug under a bounded condition, material reliability gap,
  or missing test that leaves changed behaviour unproved.
- **Low**: a small but concrete defect. Never use Low for style or preference.

Critical, High, and Medium block readiness. Low does not unless several Low
findings share one root cause that makes the change unsafe.

## Output

Findings are the primary output, ordered by severity. If there are none, say
`No findings.` Do not add a praise section.

```markdown
## Code review max — !<iid>

**Head:** `<full-head-sha>`
**Verdict:** <BLOCK | PASS>

### Findings

1. **[High] `path/file.ts:42` — <short title>**
   <bad behaviour and exact trigger>.
   **Evidence:** <code/test/command>.
   **Fix direction:** <smallest reasonable direction>.

### Verification

- <focused commands run and outcomes>
- <important risks checked and cleared>

<!-- code-review-max:mr=<iid> head=<full-head-sha> -->
```

The marker is mandatory and must be the final line. `mr-review` uses it to
prove that this conversation contains the correctness pass for this exact MR
head.

Do not publish findings to GitLab. `mr-review` consolidates both passes and owns
the publish checkpoint.

## Never

- Review a truncated diff.
- Review the current working tree instead of the pinned MR head.
- Treat reviewer consensus as proof.
- Manufacture findings to look thorough.
- Make code changes.
- Post notes, approve, merge, or change Jira.
