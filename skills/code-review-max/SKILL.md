---
name: code-review-max
description: Deep first-pass correctness review of a change. Pins the change head, fans out independent read-only review lenses, verifies every candidate against the code, and leaves stamped findings for mr-review. Use when the user types /code-review-max, asks for the maximum review pass, or /delivery review needs its correctness pass.
---

# Code review max

Target: the skill arguments, a change ref or its user-facing MR iid alias (`840` or `!840`).

Resolve this SKILL.md to its real path, load the first existing runtime of
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`, and export `FACTORY_ROOT` by its
procedure. Resolve `<repoRoot>` with `git rev-parse --show-toplevel`.
`reference/` paths are relative to this skill's folder.

The SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill)
outranks this skill. Review the approved change only. Do not enlarge scope,
merge, or treat reviewer prose as a reason to skip a failed gate.

This correctness pass finds bugs, security issues, behavioural regressions,
reliability failures, and missing tests. `mr-review` judges the approach
afterwards in this conversation. Review subagents report here and publish
nothing.

## Preconditions

Stop at the first failure:

1. Parse the skill arguments as a change ref, accepting `840` or `!840` and nothing else. Strip a leading `!`. That value is `<ref>`, the user's alias for the change reference.
2. Write `{ "ref": "<ref>" }` to `.review/mr-<ref>/read-input.json` and run
   `read`. Before requesting any review evidence, replace that file with
   `{ "ref": "<ref>", "headRevision": "<full-head-sha-from-read>" }`, then run
   the rest in this order. Every one must succeed:
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

State: `Reviewing !<iid> at <full-head-sha> against <full-base-sha>.` Below,
`<dir>` is `.review/mr-<iid>/<full-head-sha>`.

## Scope this round

Run:
```
bun "${FACTORY_ROOT}/scripts/review-scope.ts" "<repoRoot>" <ref> <full-base-sha> <full-head-sha>
```
Persist its output at `<dir>/review-scope.json`. A non-zero exit stops the
review.

- **`full`**: review the whole change against the base.
- **`delta`**: review only what changed since the earlier review at `since`.

When the output names a `previous` review, read `reference/later-rounds.md`
before building the brief. The scope never narrows release readiness, which
still reads the whole change.

## Carry needs-validation items forward

Every needs-validation item of the most recent earlier review is accounted for
in this review, in every scope and adjudication mode, including `none`: listed
again unchanged under `### Needs validation`, or closed under
`### Earlier findings` (`closed:`), as `reference/later-rounds.md` says.
Release readiness refuses a review that drops one.

## Build the review brief

Give every reviewer the same immutable brief:

- Change ref (and the user-facing MR iid alias), full base SHA, full head SHA.
- Requirement and acceptance criteria, quoted with their source.
- Changed paths: the `paths` list the command below prints, copied exactly,
  with each `binary` file named as not read as text.
- Repository rules and the commands CI runs.
- Instructions to inspect any caller, schema, migration, configuration, or test
  outside the diff that is needed to prove a claim.
- The severity and evidence rules below.
- `reference/lenses.md` at its real path: lens checks, candidate format, and
  the `Examined files:` contract.

Take the changed paths from this script, as the coverage check does:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" paths "<base-or-since>" "<full-head-sha>"
```
`<base-or-since>` is `<full-base-sha>`; a delta review passes `since` and the
`--earlier` argument `reference/later-rounds.md` gives. A non-zero exit stops
the review.

Do not give reviewers the author's reasoning as evidence: a statement in the
change description is a claim to verify. Give lenses this brief and the pinned
diff, not a bundled review packet; only the adjudicator gets a packet.

Persist the brief at `<dir>/brief.md` so the second pass can run in a fresh
conversation on any conforming runtime. Reuse it only while its ref and full
head SHA match live `read` metadata; otherwise rebuild it.

## Parallel review

Ensure `.delivery/routing/model-inventory.json` records the runtime's exact
model identifiers (delivery skill, Phase 1), then resolve the `standard`
capability and check for a second family:
```
bun "${FACTORY_ROOT}/scripts/model-catalogue.ts" resolve standard .delivery/routing/model-inventory.json
bun "${FACTORY_ROOT}/scripts/model-catalogue.ts" second-family standard .delivery/routing/model-inventory.json
```
Pass that exact model identifier to every review-lens subagent. When
`otherFamily` names a model, read `reference/second-family.md`. When
`otherFamily` is null, every lens uses the standard model. Either way, write
the printed `reason` and each lens's model under `### Lens models`.

Classify the pinned diff from its paths and diff, never its description:

- A **small reversible change** touches at most 2 files, has fewer than 50
  changed lines, is a two-way door, and touches none of Data, Contract, Config,
  Auth, or Infra.
- A **contained change** is reversible, touches at most 6 files with fewer
  than 400 changed lines, and touches none of Data, Contract, Config, Auth,
  Infra, or Dependencies.
- Anything else is a **full review**, including an unknown classification.

Measure with
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" measure <base-sha> <head-sha>`,
which leaves out and reports the change's own OpenSpec, `.delivery/` and
`.review/` files. Classify surfaces from its `paths` only, so a spec's
`.openspec.yaml` is never a Config surface. Start from
`bun "${FACTORY_ROOT}/scripts/diff-scan.ts" <base-sha> <head-sha>`, which
applies the same exclusions. Its `surfaces` are a floor: add a surface you can
prove, never remove a scanned one. Any `oneWay` signal makes the change
one-way. A non-zero exit stops the review. When the scan reports `zones`, read
`reference/risk-zones.md`.

Write the counts, reversibility decision, whether every classification field
was proved, and the normalized surfaces to `<dir>/review-fanout-input.json`
and run:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" ".review/mr-<iid>/<full-head-sha>/review-fanout-input.json"
```
The returned `lenses` array is authoritative; persist it beside the input.
Under `DELIVERY_LEVEL`, `max` adds every lens and `min` drops only lenses size
alone added. Invalid input or a non-zero exit stops the review; never
guess a reduced fan-out.

When `lenses` is empty, do not dispatch review-lens subagents: run the same
coverage command with no reports so the skip is recorded, then follow
`reference/no-lenses.md`.

Otherwise start one fresh read-only subagent per named lens, in one parallel
batch, with the brief and the pinned diff. For a small reversible
or contained change, run lenses 1 and 2.
For a full review, run all four lenses. Lenses may use read, search, and
read-only git commands, and must not edit, comment, post, commit, or push.
The reduced pass never applies to auth, migrations, public contracts,
configuration, infrastructure, one-way changes, or an incomplete diff. Bound
every command's output, for example with `| head -c 8000`, because every later
step re-reads it.

1. **Correctness and security**
2. **Tests and specification**
3. **Reliability and operations**
4. **Repository standards and blast radius**

## Check coverage

Every changed file must be reported as examined by at least one lens or, failing
that, by one focused pass. The lists are the lenses' own reports: this proves a
file was reported as examined, not that it was read, nor how much of a file a
lens read.

Write `<dir>/lens-coverage-input.json` with the scope (`full` or `delta`),
`plannedLenses` set to the fan-out `lenses`, and `reports` holding each planned
lens's name and `Examined files:` list transcribed unchanged (with no lenses,
an empty plan and no reports). Add no path list: the script finds the changed
files. Then run:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" coverage "<base-or-since>" "<full-head-sha>" ".review/mr-<iid>/<full-head-sha>/lens-coverage-input.json" ".review/mr-<iid>/<full-head-sha>/lens-coverage.json"
```
Use the brief's `<base-or-since>`; a delta review adds the same `--earlier`
argument. A non-zero exit stops the review; a refusal names the lens or file at
fault and writes nothing. When it refuses a lens report, or a lens's candidates
cannot be read, read `reference/coverage-repair.md`: that lens gets one repair
turn. A second refusal stops the review. Adjudication output is gating and is
never repaired.

A `skipped` result is handled as `reference/no-lenses.md` says. Otherwise
state how many files `needsFocusedPass` holds. When it holds any, or when
resuming a review that had focused passes, read
`reference/focused-pass.md`: it starts one fresh read-only subagent per
`needsFocusedPass` file, all in one parallel batch, on the `standard` model
with its exact model identifier, and their candidates join the lens candidates
for adjudication. Coverage alone does not change the verdict.

## Adjudicate every candidate

When no lens and no focused pass returned a candidate, skip the filter and
`record`. Otherwise give every candidate an id, `c1`, `c2` and so on in lens
order, then the focused-pass reports in `unexamined` order, and write the id at
the head of each candidate in those evidence files. Write each id, cited path,
and cited line, if any, to `<dir>/memory-candidates.json` as
`{"candidates":[...]}` and ask which candidates sit in code a remembered
rejection cited (`<head-sha>` is `<full-head-sha>`; `<candidates.json>` is that
file):
```
bun "${FACTORY_ROOT}/scripts/review-memory.ts" filter "<repoRoot>" <iid> <head-sha> <candidates.json>
```
Persist its output at `<dir>/memory-filter.json`. A non-zero exit stops the
review. The filter only reports: never remove a candidate because of it.

Write every lens and focused-pass candidate's id and severity to
`<dir>/lens-candidates.json` as
`{"candidates":[{"id":"c1","severity":"Low"}, ...]}` and run
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" adjudication <that file>`. The
returned `mode` is authoritative:

- `none`: no lens and no focused pass returned a candidate. Write the output
  with `No findings.` and `PASS`; there is nothing to verify among lens
  candidates. After an earlier review it still writes the carried and closed
  needs-validation items.
- `standard`: every candidate is Low. One fresh read-only subagent
  adjudicates, as `reference/standard-adjudication.md` says. It may raise a
  severity.
- `main`: a candidate is Medium or above. The main conversation adjudicates.
  It writes `memory-outcome.json` itself and runs `record`.

Before adjudicating, bundle the work item, change spec, pinned diff, and every
lens and focused-pass report into one packet. `scripts/review-packet.ts` keeps
only the last 6000 characters of an evidence file, so the filter result goes
last, after every candidate file and any earlier review's `max.md`:
`bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item file> --spec <change dir> --diff <pinned diff> --evidence <lens 1 candidates> ... --evidence .review/mr-<iid>/<full-head-sha>/memory-filter.json --out .review/mr-<iid>/<full-head-sha>/adjudication-packet.md`.
Whoever adjudicates owns the verdict, reads that packet first instead of opening
each input on its own, then reads the cited code of several candidates in one
command where it can. For every candidate:

0. A candidate the filter marked `prior-rejection-at-location` takes step 0 of
   `reference/review-memory.md` before any cited code is read. A candidate
   marked `fresh` goes straight to step 1.
1. Read the cited code at the pinned head and enough surrounding code to verify
   the claim.
2. Confirm the line exists in the head diff or explain why an unchanged line is
   the correct anchor.
3. Run the cheapest focused test or reproduction when practical, output
   bounded.
4. Search for an existing guard that clears the risk.
5. Drop duplicates and anything already raised in the change discussions.
6. Drop claims that depend only on a name, comment, or reviewer assertion.
7. Downgrade or drop a finding whose impact or trigger cannot be shown, unless
   step 8 applies.
8. Keep a candidate as **needs-validation** instead of dropping it under step 7
   only when its harm hinges on one named fact outside the repository that you
   searched the repository for and did not find, and every condition in
   `reference/needs-validation.md` holds. If the repository does show the fact,
   the candidate is judged by that fact. "I am not sure" is not a missing fact.
   Never run the owner check, and never probe a live environment.
9. Drop "could be shorter" or preferred-style findings. An unnecessary-
   complexity finding must name the existing capability that can be reused,
   the concrete cost, and the smallest complete fix.

No candidate is a finding merely because several reviewers repeated it.

### Search for variants

When you confirm a Medium-or-higher finding, read `reference/variant-search.md`
before writing the output. Low findings get no variant search.

### What to remember

Write `<dir>/memory-outcome.json` as `reference/review-memory.md` says, or as
`{}` when nothing was disproved, reversed, or dropped, and run (`<outcome.json>`
is that file):
```
bun "${FACTORY_ROOT}/scripts/review-memory.ts" record "<repoRoot>" <iid> <head-sha> <outcome.json>
```
Keep the `previouslyDisproved` text it prints for the output. An exit of 1
stops the review. An exit of 3 does not: it refused items, and
`reference/review-memory.md` says how to correct them. Write the output after
the last `record` run.

## Severity

- **Critical**: exploitable security issue, irreversible data loss/corruption,
  or a change that cannot safely ship.
- **High**: a likely user-visible regression, authorization failure, contract
  break, broken migration/rollback, or failure of a primary path.
- **Medium**: a real bug under a bounded condition, material reliability gap,
  or missing test that leaves changed behaviour unproved.
- **Low**: a small but concrete defect. Never use Low for style or preference.

Rate by the impact the evidence shows, not the worst the area could suffer:

- Severity never exceeds demonstrated impact. A finding whose concrete damage
  you cannot state (what breaks, for whom, on what input) is Low at most, or
  dropped under adjudication step 7.
- Medium or above needs both a named trigger and a stated consequence. Without
  both, it is Low.
- A finding that only weakens a control (one layer of several removed, a check
  made easier to miss) rates lower than one that defeats it (the control no
  longer holds for an input you can name).

Critical, High, and Medium block readiness. Low does not unless several Low
findings share one root cause that makes the change unsafe.

A needs-validation item carries no severity and is not a finding, so it never
sets `BLOCK`.

## Output

Findings come first, ordered by severity, or `No findings.` No praise section.

```markdown
## Code review max — !<iid>

**Head:** `<full-head-sha>`
**Verdict:** <BLOCK | PASS>

### Findings

1. **[High] `path/file.ts:42` — <short title>**
   <bad behaviour and exact trigger>.
   **Evidence:** <code/test/command>.
   **Fix direction:** <smallest reasonable direction>.
   **Also at:** `path/other.ts:17`, ... (omit when none).

### Needs validation

1. **`path/file.ts` — <short title>**
   **Missing fact:** <the exact fact the repository cannot show>.
   **Owner check:** <a safe, read-only check the owner can run to settle it>.

### Previously disproved

- `path/file.ts:42` <title>. Earlier reason: <reason> (judged at <12 hex>)

### Verification

- <focused commands run and outcomes>

### Lens models

- <reason printed by second-family>
- <lens>: <exact model identifier>

### Coverage

- <n> of <m> changed files were reported as examined by at least one lens.

<!-- code-review-max:mr=<iid> head=<full-head-sha> -->
```

Omit `### Previously disproved` when nothing was dropped as previously
disproved; `reference/review-memory.md` says how to fill it.

Write `### Coverage` in plain sentences: how many changed files were reported
as examined; each file no lens reported, and whether its focused pass examined
it or failed; each file carried over from the earlier review, counting delta
and carried files separately; and each binary file not read as text. When the
check was skipped because no lens ran, say so instead. Say that the lists are
the lenses' own reports. Never call coverage proof.

Omit `### Needs validation` when it is empty. A needs-validation item never
sets `BLOCK`: with no finding and one item, the output says `No findings.` and
`PASS`. Do not write an item's id: code computes it.

Write this complete output to `<dir>/max.md`, ending with the mandatory marker
line. `mr-review` accepts it or the same output in the conversation, and
verifies iid and SHA against live metadata.

Do not publish findings through the forge provider. `mr-review` consolidates both passes and owns
the publish checkpoint.

## Never

- Review the current working tree instead of the pinned change head.
- Treat reviewer consensus as proof.
- Manufacture findings to look thorough.
- Make code changes.
- Post notes, approve, merge, or change tracker items.
- Call a provider-native helper. Change evidence comes only from
  `scripts/forge-provider.ts`.
