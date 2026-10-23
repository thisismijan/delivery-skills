---
name: code-review-max
description: Deep first-pass correctness review of a change. Pins the change head, fans out independent read-only review lenses, verifies every candidate against the code, and leaves stamped findings for mr-review. Use when the user types /code-review-max, asks for the maximum review pass, or /delivery review needs its correctness pass.
---

# Code review max

Target: the skill arguments (`<ref>`; a user-facing MR iid such as `840` or `!840` is an alias for that change ref)

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
export `FACTORY_ROOT` as that file describes. Resolve `<repoRoot>` with
`git rev-parse --show-toplevel`.

The SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill)
outranks this skill. Review the approved change only. Do not enlarge scope,
merge, or treat reviewer prose as a reason to skip a failed gate.

This is the correctness pass. It finds bugs, security issues, behavioural
regressions, reliability failures, and missing tests. It does not judge whether
the author chose the best overall approach; `mr-review` does that second.

Run inline in the conversation that will run `mr-review`. Review subagents
report to this conversation; they do not publish anything.

## Preconditions

Stop at the first failure:

1. Parse the skill arguments as a change ref, accepting `840` or `!840` and nothing else. Strip a leading `!`. That value is `<ref>` (the CLI user alias for the opaque change reference).
2. Write `{ "ref": "<ref>" }` to `.review/mr-<ref>/read-input.json`, then run
   `read`. Replace that file with
   `{ "ref": "<ref>", "headRevision": "<full-head-sha-from-read>" }` before
   requesting any review evidence. Then run the remaining exact commands in
   this order. Every one must succeed:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" files "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" diff "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
   ```
   If any command exits non-zero, or the diff is refused as incomplete or overflowed, stop. Never review a partial diff.
3. Read the exact head and base SHAs from the `read` result's revisions. Fetch both without checking either out. The current branch is irrelevant.
4. Read the change description from the `read` result and the commits with:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" commits "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
   ```
   Identify the requirement from the change, linked ticket, and OpenSpec change. If none says what the change is meant to do, report that as a blocking review-input failure and stop.

State: `Reviewing !<iid> at <full-head-sha> against <full-base-sha>.`

## Build the review brief

Give every reviewer the same immutable brief:

- Change ref (and the user-facing MR iid alias), full base SHA, full head SHA.
- Requirement and acceptance criteria, quoted with their source.
- Changed paths.
- Repository rules and the commands CI runs.
- Instructions to inspect any caller, schema, migration, configuration, or test
  outside the diff that is needed to prove a claim.
- The severity and evidence rules below.

Do not give reviewers the author's reasoning as evidence. A statement in the
change description is a claim to verify.

Give lenses this brief and the pinned diff, not a bundled review packet. Each
lens reads the code it checks anyway, so a packet's spec and evidence text only
adds context that every later step re-reads. The adjudicator is different: it
has to read the work item, spec, diff and every lens's candidates, so it gets
the adjudication packet below instead.

Persist the brief at `.review/mr-<iid>/<full-head-sha>/brief.md`. Reuse it only
when its ref and full head SHA still match live `read` metadata; otherwise
rebuild it. This worktree-local artifact lets the second pass run in a fresh conversation on any conforming runtime.

## Parallel review

Read the exact model identifiers the current runtime advertises and ensure
`.delivery/routing/model-inventory.json` records them as Phase 1 of the
delivery skill specifies. Resolve the `standard` capability:
```
bun "${FACTORY_ROOT}/scripts/model-catalogue.ts" resolve standard \
  .delivery/routing/model-inventory.json
```
Pass that exact model identifier to every review-lens subagent. These lenses
produce independently adjudicated candidates, so a frontier model is not
required for them; the main conversation still verifies every candidate.

Classify the pinned diff before dispatch:

- A **small reversible change** touches at most 2 files, has fewer than 50
  changed lines, is a two-way door, and touches none of Data, Contract, Config,
  Auth, or Infra. Use the changed paths and diff, not the change description,
  to prove every condition.
- A **contained change** is reversible, touches at most 6 files with fewer
  than 400 changed lines, and touches none of Data, Contract, Config, Auth,
  Infra, or Dependencies. It also runs lenses 1 and 2.
- Anything else is a **full review**, including an unknown classification.

Measure the counts with
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" measure <base-sha> <head-sha>`.
It leaves out the change's own OpenSpec, `.delivery/` and `.review/` files,
which are not code and are reviewed against it, and reports what it left out.
Classify surfaces from its `paths` only, so a spec's `.openspec.yaml` is never
a Config surface.

Write the measured counts, reversibility decision, whether every classification
field was proved, and normalized surfaces to
`.review/mr-<iid>/<full-head-sha>/review-fanout-input.json`, then run:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" \
  ".review/mr-<iid>/<full-head-sha>/review-fanout-input.json"
```
The returned `lenses` array is authoritative. Invalid input or a non-zero exit
stops the review; never guess a reduced fan-out. Persist the result beside the
input.

Start fresh read-only subagents in one parallel batch. For a small reversible
or contained change, run lenses 1 and 2.
For a full review, run all four lenses. They may use read, search, and
read-only git commands. They must not
edit, comment, post, commit, or push. The reduced pass never applies to auth,
migrations, public contracts, configuration, infrastructure, one-way changes,
or an incomplete diff. Bound every command's output, for example with
`| head -c 8000`: output is re-read on every later step, so one unbounded
reproduction can cost more than the rest of the review.

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
   - Check whether the diff adds a dependency, abstraction, wrapper, option,
     conversion, configuration knob, or duplicated capability when an existing
     repository or platform capability already satisfies the requirement.
     Report it only when the extra machinery has a concrete cost such as a
     larger public surface, additional failure path, duplicated logic, or
     operational burden. Never trade away validation, security, accessibility,
     data-loss protection, required error handling, or accepted boundary
     behaviour merely to reduce code.

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

Write each lens's candidate severities to
`.review/mr-<iid>/<full-head-sha>/lens-candidates.json` as
`{"candidates":[{"severity":"Low"}, ...]}` and run
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" adjudication <that file>`. The
returned `mode` is authoritative:

- `none`: no lens returned a candidate. Write the output below with
  `No findings.` and a `PASS` verdict; there is nothing to verify.
- `standard`: every candidate is Low. Dispatch one fresh read-only subagent on
  the resolved `standard` model to apply this section and the Severity rules.
  It may raise a severity, and it still blocks when several Low findings share
  one root cause that makes the change unsafe.
- `main`: a candidate is Medium or above. The main conversation adjudicates.

Before adjudicating, bundle the work item, the change spec, the pinned diff and
every lens's candidates into one packet:
`bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item file> --spec <change dir> --diff <pinned diff> --evidence <lens 1 candidates> ... --out .review/mr-<iid>/<full-head-sha>/adjudication-packet.md`.
Whoever adjudicates reads that packet first instead of opening each input on
its own, then reads the cited code of several candidates in one command where
it can. Every separate read is re-read on each later step.

Whoever adjudicates owns the verdict. For every candidate:

1. Read the cited code at the pinned head and enough surrounding code to verify
   the claim.
2. Confirm the line exists in the head diff or explain why an unchanged line is
   the correct anchor.
3. Run the cheapest focused test or reproduction when practical, with its
   output bounded as the lenses' is.
4. Search for an existing guard that clears the risk.
5. Drop duplicates and anything already raised in the change discussions.
6. Drop claims that depend only on a name, comment, or reviewer assertion.
7. Downgrade or drop a finding whose impact or trigger cannot be shown.
8. Drop "could be shorter" or preferred-style findings. An unnecessary-
   complexity finding must name the existing capability that can be reused,
   the concrete cost, and the smallest complete fix.

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

Write this complete output to
`.review/mr-<iid>/<full-head-sha>/max.md`. The marker is mandatory and must be
the final line. `mr-review` accepts either this pinned artifact or the same
output in the conversation, but verifies iid and SHA against live metadata.

Do not publish findings through the forge provider. `mr-review` consolidates both passes and owns
the publish checkpoint.

## Never

- Review a truncated diff.
- Review the current working tree instead of the pinned change head.
- Treat reviewer consensus as proof.
- Manufacture findings to look thorough.
- Make code changes.
- Post notes, approve, merge, or change tracker items.
- Call a provider-native helper. Change evidence comes only from
  `scripts/forge-provider.ts`.
