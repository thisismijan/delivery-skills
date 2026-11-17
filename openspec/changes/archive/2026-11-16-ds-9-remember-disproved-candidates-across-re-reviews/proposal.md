## Why

When a merge request is reviewed again, review starts from nothing. A candidate that adjudication already disproved can come back on the same unchanged code, and the operator has to dismiss it a second time. The review skill does not keep dropped candidates anywhere today, so there is no state to build on.

A script cannot decide on its own whether two candidates make the same claim. Lens candidates have no title, and each review's lenses word a claim differently, so a key built from a title would almost never match. A script can answer one question exactly: is the code a rejection cited still there, unchanged, at the place the new candidate points to? The adjudicator, which already reads every candidate, can answer the other: is this the same claim as the remembered one? This change splits the work along that line.

## What Changes

- A new script, `factory/scripts/review-memory.ts`, keeps a per merge request file at `.review/mr-<iid>/rejected.json`, outside the per head directories, so a later head can read what an earlier head's adjudication disproved
- Its `record` command stores each candidate the adjudicator disproved, keyed by the path and the cited code as read at the head the adjudicator reviewed, with the claim's title and the rejection reason kept beside it. It also stores, with the rejection, the code the disproof rests on outside that range, such as a guard in a caller, up to 3 places. The title is stored for a later reader and is never part of a match
- Its `filter` command takes the lens candidates and a pinned head and re-reads each remembered file at that head with `git show`. It reports `prior-rejection-at-location`, with the remembered title, reason and head listed in a last section kept inside the review packet's evidence limit, for a candidate whose cited line lies in remembered code that is still unchanged and whose stored guards are all still present, and `fresh` for every other candidate. A rejection whose guard was removed is no longer reported. It never suppresses a candidate. A candidate with no cited line is `fresh`, not refused
- The cited code is compared by content, with each line trimmed and blank lines ignored, and not by line number, so an unrelated edit above the code does not make unchanged code look changed. Changed, removed, deleted or renamed code always makes a candidate `fresh`
- `skills/code-review-max/SKILL.md` gives every candidate an id, runs `filter` before adjudication, and puts its output in the adjudication packet. The adjudicator still sees every candidate. For one marked `prior-rejection-at-location` it compares the claim with the remembered one before re-investigating: the same claim is dropped without re-investigation and listed under `### Previously disproved` with the earlier reason, and any other claim is judged fresh
- A refused outcome has its own exit code and a message naming every refused item, so the conversation corrects it, drops what is still refused, and finishes the review instead of stopping it
- In a delta review the lenses are given the earlier review without its `### Previously disproved` section, with a brief that says it holds no findings
- The skill defines what the standard-mode adjudication subagent returns, so `record` gets real input in every mode: the findings and one outcome object in the shape `record` reads
- After adjudication `record` stores the claims found false by fresh judgement, forgets only the one remembered rejection the adjudicator has reversed by raising the same claim, and prints the `### Previously disproved` list for the output
- The `### Previously disproved` section is part of the output whenever the adjudicator dropped a candidate as previously disproved, including a review whose every candidate was dropped that way, which reports `No findings.` with the section. `skills/mr-review/SKILL.md` says the section is context, not a finding, and prints it to the operator beside the drafts without publishing it
- Memory applies to the same merge request only, in a full review and in a delta review alike. A candidate on another merge request, or one never rejected, is judged exactly as before
- `skills/delivery/workflows/mr-review-to-ready.md`, `docs/workflow.md`, and `docs/reference.md` describe the memory, its file, and its limits. The file lives under the gitignored `.review/`, so a fresh clone or another runtime starts without it, as delta review already does

## Capabilities

### New Capabilities

- `review-memory`: remembering disproved review candidates for one merge request by the code they cited, reporting a prior rejection at a location whose cited code is unchanged so the adjudicator can drop the same claim without re-investigating it, and forcing a fresh judgement once that code changes

### Modified Capabilities

None. The `cost-efficient-routing` capability's `review-scope.ts` requirements are reused as conventions and are not changed.

## Out of Scope

- Tracking fixed findings, which delta review already does
- Remembering rejections across different merge requests
- The needs-validation state (slice 8)
- Recording duplicates, already raised claims, downgrades, or style drops
- Matching a claim by meaning in a script: whether two claims are the same is the adjudicator's judgement, and its mistakes are the risk this change accepts and shows to the operator
- Carrying the memory to another clone, runtime, or machine
- Removing a remembered rejection once its code is gone from the file; it stays in the file unread
- Recording a disproof that rests on more than 3 outside places or on something no file shows, such as runtime configuration; such a claim is judged again
- Changing `review-scope.ts`, `review-fanout.ts`, `review-packet.ts`, or how `mr-review` consolidates findings

## Impact

- `factory/scripts/review-memory.ts` (new) defines the `rejected.json` schema, the code normalisation, the content search, the output budget (derived from the packet's exported limit, with no change to `review-packet.ts`), and the `record` and `filter` commands
- `factory/scripts/review-memory.test.ts` (new) runs both commands and the exported functions against temporary git repositories
- `skills/code-review-max/SKILL.md` gains candidate ids, the filter step, the packet input, the claim comparison, the standard-mode return, the recording rule, the record step, and the output section
- `skills/mr-review/SKILL.md` gains one rule in its consolidation phase for the `### Previously disproved` section
- `skills/delivery/workflows/mr-review-to-ready.md` states that a re-review does not re-investigate a settled rejection while its code is unchanged, and its limits
- `docs/workflow.md` and `docs/reference.md` describe the behaviour and give both invocations
- `factory/scripts/workflow-contracts.test.ts` asserts that the skill and the docs carry the invocations the script exports, in order
- `skills/delivery/checks/delivery-specs.test.ts` asserts the comparison step, the recording rule, the standard-mode return and the output section, the guard and reversal rules, the recovery from a refused outcome, and the delta paragraph in the skill, and the `mr-review` rule
- The new test file needs no change to `.gitlab-ci.yml`: its one `test` job runs `bun run test` in `factory/`, which picks up every `*.test.ts` file there, and its `check` job covers the new script's lint and types
