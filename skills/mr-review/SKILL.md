---
name: mr-review
description: Second-pass change review. Runs after code-review-max, judges whether the author chose the right approach, merges both passes into one set of findings, and publishes them through the forge provider. Use when the user types /mr-review, asks whether a change took the right approach, or asks to post review findings.
---

# Second-pass change review

Target change: the skill arguments (`<ref>`; a user-facing MR iid is an alias for that change ref)

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
export `FACTORY_ROOT` as that file describes. Resolve `<repoRoot>` with
`git rev-parse --show-toplevel`.

The SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill)
outranks this skill. Review the approved change only. Do not enlarge scope,
merge, or treat reviewer prose as a reason to skip a failed gate.

This skill runs inline, not in a forked subagent, because it has to read the
correctness findings out of this conversation. Note publication is not a
default tool: every publish must raise its own permission prompt.

Write `{ "ref": "<ref>" }` once to `.review/mr-<ref>/read-input.json`. Every
evidence and publication call below uses that same ref. Never invent a helper
name and never call a provider-native wrapper.

## Phase 0 — Preconditions

Stop and say so, without doing any of the work below, if any of these fail:

- The skill arguments are empty or not a number. Ask for the MR iid.
- This exact `read` fails. Report the error verbatim and stop.
  ```
  bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
  ```
- No accepted correctness pass for this same change and current head SHA is in this
  conversation or at `.review/mr-<iid>/<full-head-sha>/max.md`. Accept
  `/code-review-max !<iid>` output ending in
  `<!-- code-review-max:mr=<iid> head=<full-head-sha> -->`; the iid and SHA
  must exactly match the live `read` result. A review provider may map that same
  stamped max pass from an equivalent invocation, but the marker, iid, and head
  SHA still have to match. Validate the artifact's final marker against live
  metadata before reading its findings. Reject a lightweight built-in review
  output: it is not the max pass and has no freshness stamp. Reject a marker for
  another iid or an older head. Tell the user to run `/code-review-max !<iid>`
  and stop.
  Do not substitute your own correctness pass for it.

## Phase 1 — Intent and prior art (no diff yet)

Run, in this exact order:

```
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
```

Replace `read-input.json` with
`{ "ref": "<ref>", "headRevision": "<full-head-sha-from-read>" }`, then run:

```
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" commits "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" discussions "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" files "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
```

The `read` result already includes the description. Non-zero exit → report
verbatim and stop.

State the requirement this change is meant to satisfy in one or two sentences, in
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

Do not run `forge-provider.ts` `diff` during this phase. The order is the point — it is
what stops you rationalising whatever the author happened to do.

## Phase 3 — Read the diff

```
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" diff "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
```

Identify which of your approaches the change took, or
describe the one it took if it isn't on your list.

If the command refuses the diff as incomplete or overflowed, stop and tell the user. Never review a
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
  rewriting the change is usually not worth it; say so.
- Reuse: grep for existing helpers, services or patterns that already do what
  the new code does. Cite `file:line`. Grep before claiming nothing exists.
- Placement: is the change in the right layer, or leaking logic somewhere that
  makes the next change harder?
- Scope: does the change do one thing, or has unrelated work been carried along?
- Name the future change this design makes expensive, if any. One or two
  specific scenarios, not speculation about hypothetical requirements.

## Phase 5 — Consolidate both passes

Build one list. Rules:

- Carry the accepted correctness findings through unchanged in substance.
  Do not re-derive, soften or re-word away their meaning.
- Drop anything already raised in the change discussions, resolved or not.
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

1. Reuse the matching `brief.md`, then write under
   `.review/mr-<iid>/<full-head-sha>/`:
   - `summary.md` — the verdict line, the approach comparison, and every finding
     that has no valid inline anchor.
   - `NN-<slug>.md` — one file per finding that does have an anchor, numbered in
     the order you want them posted.
   End every file with the marker line `<!-- mr-review:<head-sha> -->`, using
   the SHA from the live `read` result.
2. Get the valid anchors with:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" anchors "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" ".review/mr-<ref>/read-input.json"
   ```
   A finding may be posted inline only if its `path:line` appears in that output. Anything else —
   context lines, removed lines, whole-file or cross-file observations — goes in
   `summary.md` with the location written in prose. Do not force an invalid anchor.
3. Check the `discussions` output for the marker from a previous run. If this
   change already carries `mr-review` notes for the same head SHA, say so and post
   nothing; a new SHA means the branch moved and a fresh review is fine.
4. Print the full text of every file in the conversation. The permission prompt
   for `forge-provider.ts` `note` shows only a filename, so this printout is the user's only real
   chance to read what would be published.
5. Dry run everything, one call per note, before any live publish. For the
   summary, write `{ "dryRun": true, "ref": "<ref>", "bodyPath": ".review/mr-<iid>/<full-head-sha>/summary.md" }`
   to a dry-run input and run:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" note "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<dry-run-input.json>"
   ```
   Repeat for each anchored finding, adding `"anchor": { "path": "<path>", "line": <line> }`
   to that finding's dry-run input. A dry-run must not set `"approved": true`.
   Non-zero exit → stop; do not ask to publish.
6. If the delivery ledger for this change records `continuous-delivery: yes`, the
   approved run plan is standing publication authorization: post everything
   after the successful dry runs without asking again. Otherwise ask the user
   to confirm, and offer three choices: post everything, post the summary only,
   or post nothing. Before asking, follow the delivery conductor's **Human
   decision brief**. Publication choices normally have no material DSA or
   system-design difference; say that explicitly and focus on visibility,
   review usefulness, and reversibility. Wait for an answer. Never infer
   authorization from prose or from a different run.
7. On standing or explicit approval, post `summary.md` first, then the anchored
   findings in order. For the summary, write `{ "approved": true, "ref": "<ref>", "bodyPath": ".review/mr-<iid>/<full-head-sha>/summary.md" }`
   and run:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" note "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<note-input.json>"
   ```
   For each anchored finding, add `"anchor": { "path": "<path>", "line": <line> }`
   and use that finding's body path. Each `note` call raises its own prompt; that is intended, do not try to
   batch around it. If one fails, report the failure and stop rather than
   continuing down the list. Never merge, close, or resolve threads.
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
