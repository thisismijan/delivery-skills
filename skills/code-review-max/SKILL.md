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

## Scope this round

Before building the brief, run:
```
bun "${FACTORY_ROOT}/scripts/review-scope.ts" "<repoRoot>" <ref> <full-base-sha> <full-head-sha>
```
Persist its output at `.review/mr-<iid>/<full-head-sha>/review-scope.json`.
A non-zero exit stops the review.

- **`full`**: review the whole change against the base, as the rest of this
  skill says. When the scope output names a `previous` review, give the lenses
  that earlier review too, and start from its needs-validation items: where the
  risk still stands, copy the missing fact unchanged rather than rewording it.
- **`delta`**: an earlier review at `since` covered this change, and what
  changed after it is small, stays inside files that review covered, and
  touches no sensitive surface, dependency, one-way step, or weakened test.
  Review only that change. Wherever this skill measures, scans, or hands the
  lenses a diff against `<full-base-sha>`, use `since` instead, and write
  `git diff <since> <full-head-sha>` to `.review/mr-<iid>/<full-head-sha>/delta.patch`
  as the diff the lenses read. Give every lens the earlier review without its
  `### Previously disproved` section: copy `.review/mr-<iid>/<since>/max.md`
  to `.review/mr-<iid>/<full-head-sha>/earlier-review.md` minus that section,
  and hand the lenses that copy. Add to the brief: confirm whether each
  earlier finding is fixed at this head, and report one that is not again at
  its current line. The earlier review holds findings only, and nothing in it
  but a finding is to be confirmed, carried, or reported. Lenses may still
  read any code outside the change to prove a claim. Under the head line of
  the output, add a `**Scope:**` line that says the review covered the changes
  since `since`, and list each earlier finding as fixed or not under
  `### Earlier findings`, which names findings only. The earlier dropped list
  is not copied into this review's: this review's list holds only what this
  review dropped. Carry every needs-validation item forward as the section
  below says, with its missing fact copied unchanged.

The scope never narrows release readiness, which still reads the whole change.

## Carry needs-validation items forward

Every needs-validation item of the most recent earlier review is accounted for
in this review, in every scope and every adjudication mode, including `none`.
The earlier review is the one `previous` names in `review-scope.json`, for a
full and a delta scope alike (`since` names the same head for a delta); a first
review has none. Account for each item in one of
two ways:

- List it again under `### Needs validation`, with its path and **Missing
  fact** copied unchanged. A reworded fact is a different item, and the
  operator would have to acknowledge it again.
- Close it under `### Earlier findings` as
  `N. **`path` — closed: <title>**`, with the unchanged `**Missing fact:**`
  line below it. The title says whether the code is gone or the repository now
  shows the fact.

Release readiness compares this review with the earlier one and refuses a
review that drops an item without either.

## Build the review brief

Give every reviewer the same immutable brief:

- Change ref (and the user-facing MR iid alias), full base SHA, full head SHA.
- Requirement and acceptance criteria, quoted with their source.
- Changed paths: the `paths` list the command below prints, with its binary
  files marked as not read as text.
- Repository rules and the commands CI runs.
- Instructions to inspect any caller, schema, migration, configuration, or test
  outside the diff that is needed to prove a claim.
- The severity and evidence rules below.
- The report contract: each lens ends with its `Examined files:` list, as
  `## Parallel review` says.

Take the changed paths from the script, not from the diff or from `measure`, so
the brief and the coverage check use the same strings:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" paths "<base-or-since>" "<full-head-sha>"
```
`<base-or-since>` is `<full-base-sha>` in a full review and `since` in a delta
review, which also adds `--earlier ".review/mr-<iid>/<since>/lens-coverage.json"`
so files the earlier review left unexamined are carried in. The output holds
`paths`, every file to check (delta files first, then carried ones), `carried`,
the carried subset, and `binary`, files with no text a lens can read. Give the
lenses `paths` copied exactly, and name each binary file as not read as text.
A non-zero exit stops the review.

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

Then check for a second model family at the same tier:
```
bun "${FACTORY_ROOT}/scripts/model-catalogue.ts" second-family standard \
  .delivery/routing/model-inventory.json
```
When `otherFamily` names a model, run exactly one lens on it in place of the
standard model: the correctness and security lens when it runs, otherwise the
first lens the plan runs. Every other lens keeps the standard model, so the lens
count and the cost stay the same, and one seat has different blind spots. When
`otherFamily` is null, every lens uses the standard model. Either way, write the
`reason` it printed and the model each lens used under `### Lens models` in the
output.

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
a Config surface. Start from
`bun "${FACTORY_ROOT}/scripts/diff-scan.ts" <base-sha> <head-sha>`, which
applies the same exclusions. Its `surfaces` are a floor: add a surface you can
prove, never remove a scanned one. Any `oneWay` signal makes the change
one-way. A non-zero exit stops the review. When the repository owner drew a
zone map, the scan also reports `zones`: copy every `zones.red` path into the
fan-out input as `redZones`, which runs every lens at any level, and name any
`zones.yellow` path in the summary without changing the fan-out.

Write the measured counts, reversibility decision, whether every classification
field was proved, and normalized surfaces to
`.review/mr-<iid>/<full-head-sha>/review-fanout-input.json`, then run:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" \
  ".review/mr-<iid>/<full-head-sha>/review-fanout-input.json"
```
The returned `lenses` array is authoritative. It reflects the run's
`DELIVERY_LEVEL`: `max` adds every lens, `min` drops only lenses that size
alone added. Invalid input or a non-zero exit stops the review; never guess a
reduced fan-out. Persist the result beside the
input.

When `lenses` is empty, do not dispatch review-lens subagents, and run the same
coverage command, with no reports, so the skip is recorded. Write
`.review/mr-<iid>/skipped-workers.json` naming `review-lens` and persist
even when `routingProfiling` is `off`:
```
bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "review-mr-<iid>" ".review/mr-<iid>/skipped-workers.json"
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "review-mr-<iid>"
```
The scorecard counts avoided workers. It never estimates tokens saved. Continue at
adjudication with no candidates. Start fresh read-only subagents in one
parallel batch only when the array names lenses. For a small reversible
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

Every lens report ends with the line `Examined files:` followed by one
`- <path>` line per file, or `Examined files: none`. A `NO FINDINGS` report
carries it too. A path is copied exactly as the brief's changed-path list
writes it. A file counts as examined only when the lens read the changed lines
in the pinned diff or the file at the head. For a deleted file, which has no
head copy, that means reading its removed lines in the pinned diff. Naming a
path from the brief or a diff header is not reading. A lens never lists a
binary file.

## Check coverage

Every changed file must be reported as examined by at least one lens or, failing
that, by one focused pass. The lists are the lenses' own reports, so this
proves a file was reported as examined, not that it was read, and it does not
measure how much of a file a lens read. The rules live in `review-fanout.ts`,
so no step depends on this conversation copying a path correctly.

Write `.review/mr-<iid>/<full-head-sha>/lens-coverage-input.json` with the
scope (`full` or `delta`), `plannedLenses` set to the `lenses` array of the
fan-out result, and `reports` holding, for each planned lens, its name and its
`Examined files:` list transcribed unchanged. Add no path list: the script
finds the changed files itself. With no lenses, write an empty plan and no
reports. Then run:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" coverage "<base-or-since>" "<full-head-sha>" ".review/mr-<iid>/<full-head-sha>/lens-coverage-input.json" ".review/mr-<iid>/<full-head-sha>/lens-coverage.json"
```
`<base-or-since>` is the same value the brief used, and a delta review adds the
same `--earlier` argument. A non-zero exit stops the review. The script names
the lens or file at fault and writes nothing when it refuses the input. A lens
report is advisory output (`subagent-outputs.ts policy review-lens`): when the
refusal names a lens report that has no `Examined files:` list or cannot be
read, give that same lens one repair turn with the script's message, asking
only for its corrected report and no new review, then run `coverage` again. A
second refusal stops the review. A lens whose candidates cannot be read in the
lens format gets the same single repair turn. Adjudication output is gating and
is never repaired.

A result with the status `skipped` means no lens ran. Go to adjudication. It
adds no second skipped-worker entry, because the skip is already recorded for
`review-lens`.

Otherwise state how many files `needsFocusedPass` holds, then start one fresh
read-only subagent per `needsFocusedPass` file, all in one parallel batch, on
the `standard` model resolved above. Pass the exact model identifier. Each gets
the brief, the pinned diff, and one file path, and applies the correctness and
security checks and the tests and specification checks of lenses 1 and 2 to
that file, reading outside it only to prove a claim. A deleted file is read
through its removed lines in the pinned diff. A carried file from an earlier
review is read at the head, because it is not in the delta patch. It returns candidates in
the lens format and ends with its own `Examined files:` list. Save each report
as `.review/mr-<iid>/<full-head-sha>/focused-pass-<n>.md`, `n` being the file's
1-based place in `unexamined`. A file gets exactly one focused pass, never
repeated, including after a resume. A binary file never gets a pass: the result
names it and the Coverage section reports it as not read as text.

Record each pass under `focused` in the input file, as `returned` with its list
transcribed unchanged, or as `failed` when it errored, timed out, returned
nothing usable, or could not start. Run the same command again. The script,
not this conversation, decides whether a pass examined its file. Keep each pass's candidates with the lens candidates for the Adjudicate
step: they share one id sequence and one `lens-candidates.json`. Add each
pass's report file to the `--evidence` arguments of `review-packet.ts`, so
the adjudicator reads the candidate text.

A failed pass is recorded and not retried: its file stays still unexamined, the
Coverage section names it, and adjudication continues. On a resumed review, run
the same command again with the fresh lens reports and an input with no
`focused` list, and dispatch only what `needsFocusedPass` returns, because the
script keeps every outcome the earlier artifact recorded. Coverage alone does
not change the verdict.

## Adjudicate every candidate

Give every candidate an id, `c1`, `c2` and so on in the order the lenses
returned them, then the focused-pass reports in `unexamined` order, and write
the id at the head of each candidate in those evidence files. Write each
candidate's id, cited path, and cited line, when it has one, to
`.review/mr-<iid>/<full-head-sha>/memory-candidates.json` as
`{"candidates":[...]}`, then ask which candidates sit in code a remembered
rejection cited (`<head-sha>` is `<full-head-sha>`, and `<candidates.json>` is
that file):
```
bun "${FACTORY_ROOT}/scripts/review-memory.ts" filter "<repoRoot>" <iid> <head-sha> <candidates.json>
```
Persist its output beside it at `.review/mr-<iid>/<full-head-sha>/memory-filter.json`.
A non-zero exit stops the review. The filter only reports. Never remove a
candidate because of its result: the adjudicator decides. The memory at
`.review/mr-<iid>/rejected.json` is for one merge request only, lives under
the worktree-local `.review/` so a fresh clone or another runtime starts
without it, and does not track fixed findings. When no lens and no focused pass returned a
candidate, skip this step and the record step below.

Write each lens's and each focused pass's candidate ids and severities to
`.review/mr-<iid>/<full-head-sha>/lens-candidates.json` as
`{"candidates":[{"id":"c1","severity":"Low"}, ...]}`, keeping every candidate,
and run
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" adjudication <that file>`. The
returned `mode` is authoritative:

- `none`: no lens and no focused pass returned a candidate. Write the output below with
  `No findings.` and a `PASS` verdict; there is nothing to verify among lens
  candidates. A review with an earlier review still writes the carried and
  closed needs-validation items under the carry-forward rule above.
- `standard`: every candidate is Low. Dispatch one fresh read-only subagent on
  the resolved `standard` model to apply this section, including step 0 and
  the recording rule, and the Severity rules.
  It may raise a severity, and it still blocks when several Low findings share
  one root cause that makes the change unsafe. Its reply ends with one fenced
  JSON object `{ "findings": "<markdown>", "outcome": { ... } }`: `findings`
  is the numbered findings in the output format, empty when there are none,
  and `outcome` is the object `record` reads, as described below. The main
  conversation writes `outcome` unchanged to `memory-outcome.json` and runs
  `record`; the subagent does neither. A reply with no such object, or whose
  `outcome` `record` refuses, is not recorded from prose: the main
  conversation adjudicates that review itself in `main` mode instead.
- `main`: a candidate is Medium or above. The main conversation adjudicates.
  It writes `memory-outcome.json` itself and runs `record`.

Before adjudicating, bundle the work item, the change spec, the pinned diff,
every lens's candidates, and every focused-pass report into one packet. `scripts/review-packet.ts` keeps only the last 6000 characters of an evidence file, so the filter result goes last: the command ends `--evidence .review/mr-<iid>/<full-head-sha>/memory-filter.json --out .review/mr-<iid>/<full-head-sha>/adjudication-packet.md`, after every lens's candidate file and the earlier review's `max.md` when one exists, as in
`bun "${FACTORY_ROOT}/scripts/review-packet.ts" --ticket <work-item file> --spec <change dir> --diff <pinned diff> --evidence <lens 1 candidates> ... --evidence .review/mr-<iid>/<full-head-sha>/memory-filter.json --out .review/mr-<iid>/<full-head-sha>/adjudication-packet.md`.
When an earlier review exists, pass its `max.md` as one more `--evidence` file
before the filter result so the adjudicator sees its needs-validation items.
Whoever adjudicates reads that packet first instead of opening each input on
its own, then reads the cited code of several candidates in one command where
it can. Every separate read is re-read on each later step.

Whoever adjudicates owns the verdict. For every candidate:

0. For a candidate the filter marked `prior-rejection-at-location`, before
   reading any cited code, compare its claim with each remembered rejection
   listed for it in `memory-filter.json`. Compare the bad behaviour and the
   trigger the candidate states, not its wording. If it describes the same bad
   behaviour under the same trigger as a listed rejection, drop it without
   re-investigating, record nothing for it, and name it under
   `droppedAsPreviouslyDisproved` with the rejection's `ref`. Otherwise judge
   it fresh by steps 1 to 9, however close the wording. When you are unsure
   whether it is the same claim, judge it fresh: a repeated look costs a
   re-read, and a wrongly dropped claim costs a finding. A candidate marked
   `fresh` goes straight to step 1. A remembered reason is context, never
   evidence: a candidate judged fresh is judged on the code at the pinned head.
1. Read the cited code at the pinned head and enough surrounding code to verify
   the claim.
2. Confirm the line exists in the head diff or explain why an unchanged line is
   the correct anchor.
3. Run the cheapest focused test or reproduction when practical, with its
   output bounded as the lenses' is.
4. Search for an existing guard that clears the risk.
5. Drop duplicates and anything already raised in the change discussions.
6. Drop claims that depend only on a name, comment, or reviewer assertion.
7. Downgrade or drop a finding whose impact or trigger cannot be shown, unless
   step 8 applies.
8. Keep a candidate as **needs-validation** instead of dropping it under step 7
   only when all of these hold: the code at the pinned head shows the bad
   behaviour; the harm depends on one named fact outside the repository, such
   as a replica count, a production setting, or a deployment topology; you
   searched the repository for that fact (configuration, manifests, CI deploy
   jobs, runbooks, `design.md`) and did not find it; and you can write down the
   missing fact and an owner check. If the repository does show the fact, the
   candidate is judged by that fact. If any condition fails, drop it under
   step 7. "I am not sure" is not a missing fact. The owner check is read-only
   and names where the owner looks, for example "read the replica count for
   this service in the deploy dashboard". Never run that check, and never probe
   a live environment.
9. Drop "could be shorter" or preferred-style findings. An unnecessary-
   complexity finding must name the existing capability that can be reused,
   the concrete cost, and the smallest complete fix.

No candidate is a finding merely because several reviewers repeated it.

### Search for variants

For each finding you confirmed at Medium or higher, search for the same root
cause elsewhere before writing the output: the same call, the same missing
guard, the same unchecked input. Search the changed files and their sibling
paths (the same folder, and files in the change's affected areas that call or
are called by the changed code), never beyond the change's affected areas.
Verify each further instance the way you verified the finding, by steps 1 to 4.
List every confirmed instance under that finding as **Also at:** with its path
and line. Do not raise an instance as a separate finding, so the fix is one
round, not one per copy. Low findings get no variant search.

### What to remember

Record a candidate only when adjudication found its claim false for the code at
the pinned head: by reading the code, by a focused reproduction or test, by
finding an existing guard that clears the risk, or by showing that its trigger
cannot occur. Name as a guard each place outside the range you read that the
disproof rests on, at most 3, each a path and a line range of at most 80
lines. Never record a duplicate, a claim already raised in the change
discussions, a downgrade that is still raised, a claim that rests only on a
name or comment, a style preference, or a candidate dropped as previously
disproved. Never record a claim whose disproof rests on more than 3 such
places, or on something no file's lines show, such as runtime configuration,
stored data, or an outside service: it is judged again in a later review. Write
the reason in plain language with repository relative paths only.

List a candidate's `id` and the rejection's `ref` under `reversed` when you
raise a finding that is the same claim as a remembered rejection listed for it,
judged by its behaviour and trigger, so the memory stops reporting it. A finding
that is a different claim reverses nothing: an unrelated rejection at the same
place is kept.

Write `.review/mr-<iid>/<full-head-sha>/memory-outcome.json` as
`{"disproved":[{"title","path","line","startLine","endLine","reason","guards":[{"path","startLine","endLine"}]}],"reversed":[{"id","rejection"}],"droppedAsPreviouslyDisproved":[{"id","rejection"}]}`,
every list optional. `line` is the line the candidate cited and lies inside
`startLine` to `endLine`, the range you read, at most 80 lines. `rejection` is
a `ref` listed in `memory-filter.json`. Then run (`<head-sha>` is
`<full-head-sha>` and `<outcome.json>` is that file):
```
bun "${FACTORY_ROOT}/scripts/review-memory.ts" record "<repoRoot>" <iid> <head-sha> <outcome.json>
```
It prints `{"recorded","reversed","previouslyDisproved"}`; keep
`previouslyDisproved` for the output. An exit of 1 stops the review: an
argument, the repository, or a memory or filter file is unusable and a repeat
cannot succeed. An exit of 3 does not: its message names every refused item,
so correct each one from the code and the filter result and run `record` again.
Remove each item that is still refused and run `record` once more. A removed
disproved or reversed item is not remembered, which costs a fresh judgement in
a later review. A removed dropped item revokes that drop: the candidate is
judged afresh by steps 1 to 9 and any finding from it goes into the output.
Write the output after the last `record` run, and say under Verification, in
plain words, how many items were not remembered. Skip `record` when no lens
and no focused pass returned a candidate.

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

A needs-validation item carries no severity. It is not a finding, so it never
sets `BLOCK`: the verdict is `BLOCK` only for a Critical, High, or Medium
finding, or several Low findings with one root cause.

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
   **Also at:** `path/other.ts:17`, `path/sibling.ts:88` (omit when none).

### Needs validation

1. **`path/file.ts` — <short title>**
   **Missing fact:** <the exact fact the repository cannot show>.
   **Owner check:** <a safe, read-only check the owner can run to settle it>.

### Previously disproved

- `path/file.ts:42` <title>. Earlier reason: <reason> (judged at <12 hex>)

### Verification

- <focused commands run and outcomes>
- <important risks checked and cleared>

### Lens models

- <reason printed by second-family>
- <lens>: <exact model identifier>

### Coverage

- <n> of <m> changed files were reported as examined by at least one lens.
- `path/file.ts` was reported by no lens. A focused pass then examined it.
- `path/other.ts` was reported by no lens. Its focused pass failed, so it stays unexamined.
- `path/older.ts` was carried over from the earlier review and was not reported by any lens.
- `assets/logo.png` is a binary file that was not read as text.

<!-- code-review-max:mr=<iid> head=<full-head-sha> -->
```

Fill `### Previously disproved` with the `previouslyDisproved` text `record`
printed, pasted as given. Omit `### Previously disproved` when nothing was
dropped as previously disproved. When every candidate was dropped as previously
disproved, the output reads `No findings.` with a `PASS` verdict and still
carries the list. The `none` mode, where no lens and no focused pass returned a candidate, has no
such list.

Write `### Coverage` in plain sentences. Count the changed files that were
checked and how many were reported as examined, and name each file no lens
reported and whether a focused pass then examined it or failed. Name each file
carried over from the earlier review, and in a delta review count the delta
files and the carried files separately. Name each binary file that was not read
as text. When the check was skipped because no lens ran, say so instead. Say
that the lists are the lenses' own reports. Never call coverage proof.

Omit `### Needs validation` when it is empty. A needs-validation item never
sets `BLOCK`: with no finding and one item, `### Findings` says `No findings.`
and the verdict is `PASS`. Do not write an
item's id: code computes it from the path and the missing fact.

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
- Treat a lens's examined-files list as proof that it read those files.
- Make code changes.
- Post notes, approve, merge, or change tracker items.
- Call a provider-native helper. Change evidence comes only from
  `scripts/forge-provider.ts`.
