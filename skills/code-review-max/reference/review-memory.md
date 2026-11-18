# Review memory

Read this when the memory filter marks a candidate `prior-rejection-at-location`, when adjudication disproves a candidate, or when `record` exits 3. It holds adjudication step 0, what goes into `memory-outcome.json`, what to do when `record` refuses items, and how the `### Previously disproved` list is filled.

The memory at `.review/mr-<iid>/rejected.json` is for one merge request only,
lives under the worktree-local `.review/` so a fresh clone or another runtime
starts without it, and does not track fixed findings.

## Step 0: a candidate at a remembered rejection

0. For a candidate the filter marked `prior-rejection-at-location`, before
   reading any cited code, compare its claim with each remembered rejection
   listed for it in `memory-filter.json`. Compare the bad behaviour and the
   trigger the candidate states, not its wording. If it describes the same bad
   behaviour under the same trigger as a listed rejection, drop it without
   re-investigating, record nothing for it, and name it under
   `droppedAsPreviouslyDisproved` with the rejection's `ref`. Otherwise judge
   it fresh by steps 1 to 9, however close the wording. When you are unsure
   whether it is the same claim, judge it fresh: a repeated look costs a
   re-read, and a wrongly dropped claim costs a finding. A remembered reason is
   context, never evidence: a candidate judged fresh is judged on the code at
   the pinned head.

## What to remember

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
a `ref` listed in `memory-filter.json`.

## When record refuses items

An exit of 1 stops the review: an argument, the repository, or a memory or
filter file is unusable and a repeat cannot succeed. An exit of 3 does not: its
message names every refused item, so correct each one from the code and the
filter result and run `record` again. Remove each item that is still refused
and run `record` once more. A removed disproved or reversed item is not
remembered, which costs a fresh judgement in a later review. A removed dropped
item revokes that drop: the candidate is judged afresh by steps 1 to 9 and any
finding from it goes into the output. Say under Verification, in plain words,
how many items were not remembered.

## The Previously disproved list

Fill `### Previously disproved` with the `previouslyDisproved` text `record`
printed, pasted as given. Omit `### Previously disproved` when nothing was
dropped as previously disproved. When every candidate was dropped as previously
disproved, the output reads `No findings.` with a `PASS` verdict and still
carries the list. The `none` mode, where no lens and no focused pass returned a
candidate, has no such list.
