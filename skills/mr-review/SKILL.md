---
description: Second-pass MR review for GitLab. Runs after code-review-max or Claude Code's native /code-review max, judges whether the author chose the right approach, merges both passes into one set of findings, and publishes them to the merge request. Use when the user types /mr-review, asks whether an MR took the right approach, or asks to post review findings to GitLab.
disable-model-invocation: true
effort: max
argument-hint: [MR iid]
allowed-tools: Bash(gl-mr:*) Bash(git *) Read Grep Glob
---

# Second-pass MR review

Target MR: `$ARGUMENTS`

This skill runs inline, not in a forked subagent, because it has to read the
correctness findings out of this conversation. `gl-note` is deliberately absent
from `allowed-tools`: every publish must raise its own permission prompt.

## Phase 0 — Preconditions

Stop and say so, without doing any of the work below, if any of these fail:

- `$ARGUMENTS` is empty or not a number. Ask for the MR iid.
- `gl-mr <iid> meta` fails. Report the error verbatim and stop.
- No accepted correctness pass for this same MR and current head SHA is in this
  conversation. Accept either:
  - Cursor `/code-review-max !<iid>` output ending in
    `<!-- code-review-max:mr=<iid> head=<full-head-sha> -->`; the iid and SHA
    must exactly match `gl-mr <iid> meta`.
  - Claude Code's native `/code-review max !<iid>` output when it identifies
    this iid and the same full head SHA.
  Reject Cursor's lightweight `/code-review` output: it is not the max pass and
  has no freshness stamp. Reject a marker for another iid or an older head.
  Tell the user to run `/code-review-max !<iid>` in Cursor (or
  `/code-review max !<iid>` in Claude Code) and stop.
  Do not substitute your own correctness pass for it.

## Phase 1 — Intent and prior art (no diff yet)

Run, in order:

- `gl-mr <iid> meta` and, if the description was truncated, `gl-mr <iid> desc`
- `gl-mr <iid> commits`
- `gl-mr <iid> discussions`
- `gl-mr <iid> changes`

State the requirement this MR is meant to satisfy in one or two sentences, in
your own words. If you cannot determine it from the description, commits and
linked issue, say so and stop — everything below is worthless without it.

List what human reviewers have already raised in the discussions output. You
will not repeat any of it later.

## Phase 2 — Derive your own approaches, before reading the diff

Read enough of the surrounding code to know how this codebase already solves
problems of this shape: its layering, its existing abstractions, its
conventions. Then list 2–4 ways the requirement could be met here, each with its
real trade-off (complexity, blast radius, performance, testability, migration
cost, how much new concept it introduces). At least one must be the boring
option: reuse or extend something that already exists.

Do not run `gl-mr <iid> diff` during this phase. The order is the point — it is
what stops you rationalising whatever the author happened to do.

## Phase 3 — Read the diff

Run `gl-mr <iid> diff`. Identify which of your approaches the MR took, or
describe the one it took if it isn't on your list.

If `gl-mr` aborts with an overflow error, stop and tell the user. Never review a
diff you know is truncated.

## Phase 4 — Judge the approach

- For each alternative, say whether it is better, worse, or a wash, and why — in
  terms of this codebase, not general principle.
- If the chosen approach is the right one, say that plainly and briefly. Do not
  manufacture alternatives to look thorough.
- Only argue for an alternative if you can name a concrete cost the chosen
  approach imposes: a file that will need changing again, a case it can't
  express, an abstraction it duplicates. "Cleaner" or "more idiomatic" is not a
  cost.
- Weigh the cost of switching now. An approach 10% better that requires
  rewriting the MR is usually not worth it; say so.
- Reuse: grep for existing helpers, services or patterns that already do what
  the new code does. Cite `file:line`. Grep before claiming nothing exists.
- Placement: is the change in the right layer, or leaking logic somewhere that
  makes the next change harder?
- Scope: does the MR do one thing, or has unrelated work been carried along?
- Name the future change this design makes expensive, if any. One or two
  specific scenarios, not speculation about hypothetical requirements.

## Phase 5 — Consolidate both passes

Build one list. Rules:

- Carry the accepted correctness findings through unchanged in substance.
  Do not re-derive, soften or re-word away their meaning.
- Drop anything already raised in the MR discussions, resolved or not.
- Drop anything you would not actually raise with the author in person.
- Merge duplicates where the correctness pass and your approach analysis are
  describing the same underlying problem, and say that's what happened.
- Tag each finding `[bug]`, `[approach]`, or `[nit]`. Cap nits at five; report
  the rest as a count.
- Every finding needs a `file:line`, the concrete cost, and whether you would
  block the merge on it.
- Mark any claim you inferred from a name rather than from reading the
  implementation. Those are the ones that get you rejected by the author.

## Phase 6 — Draft, show, then publish

1. `mkdir -p .claude/review/mr-<iid>` and write:
   - `summary.md` — the verdict line, the approach comparison, and every finding
     that has no valid inline anchor.
   - `NN-<slug>.md` — one file per finding that does have an anchor, numbered in
     the order you want them posted.
   End every file with the marker line `<!-- mr-review:<head-sha> -->`, using
   the SHA from `gl-mr <iid> meta`.
2. Get the valid anchors with `gl-mr <iid> newlines`. A finding may be posted
   inline only if its `path:line` appears in that output. Anything else —
   context lines, removed lines, whole-file or cross-file observations — goes in
   `summary.md` with the location written in prose. Do not use `--force`.
3. Check the `discussions` output for the marker from a previous run. If this
   MR already carries `mr-review` notes for the same head SHA, say so and post
   nothing; a new SHA means the branch moved and a fresh review is fine.
4. Print the full text of every file in the conversation. The permission prompt
   for `gl-note` shows only a filename, so this printout is the user's only real
   chance to read what would be published.
5. Dry run everything, in one batch:
   `gl-note <iid> --file .claude/review/mr-<iid>/summary.md --dry-run`
   and the same for each anchored finding with its `--inline <path>:<line>`.
6. Ask the user to confirm, and offer three choices: post everything, post the
   summary only, or post nothing. Wait for an answer. Never post before this.
7. On approval, post `summary.md` first, then the anchored findings in order.
   Each `gl-note` call raises its own prompt; that is intended, do not try to
   batch around it. If one fails, report the failure and stop rather than
   continuing down the list.
8. Report what was posted, what was skipped, and why.

## Output shape for the summary note

```markdown
**Verdict:** <approach is sound | sound with reservations | a better option is worth taking>

<three sentences: what the change does and how>

### Approach
<the alternatives considered, ranked, each with its trade-off and your call>

### Findings
1. `[bug]` `path/to/file.py:142` — <problem>. <concrete cost>. <blocking or not>
2. ...

### What's good here
<briefly, and only if true>

<!-- mr-review:<head-sha> -->
```
