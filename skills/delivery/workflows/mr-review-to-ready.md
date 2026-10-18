# Workflow: mr-review-to-ready

Second-line review of a ready merge request: correctness pass, then approach pass,
optional publish, then optional factory comment-fix loop until the human is
ready to merge. In the runtime compose `/code-review-max` and `/mr-review`; in
the runtime compose native `/code-review max` and `/mr-review`. When fixing,
compose `/address-comments`. Do not reimplement their phases.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a ready MR needs the dual review chain and any resulting fixes before
a human merges.

## Trigger

**Event:** operator supplies a merge request **iid** (integer, e.g. `740`) in a
the runtime or the runtime session with cwd = **target repo** (so `gl-mr` resolves
the project from `origin`).

Optional: work-item key for the same change, needed only if `/address-comments`
will run.

## Preconditions

- `gl-mr` and `gl-note` on `PATH` (`~/.local/bin`); token at `~/token` (or
  `GL_TOKEN_FILE`)
- MR is open and fetchable: `gl-mr <iid> meta` succeeds
- For the address-comments path: this delivery pack loaded, open MR on the spec branch,
  work-item key known
- **Same conversation** must hold both review passes: `/mr-review` reads the
  stamped correctness findings from this thread and will not substitute its
  own correctness pass

## Steps

### 1. Correctness pass

the runtime:

```
/code-review-max !<iid>
```

the runtime:

```
/code-review max !<iid>
```

Example in this runtime: `/code-review-max !740`.

Persist findings at `.review/mr-<iid>/<full-head-sha>/max.md`. Do not skip ahead
to `/mr-review` unless this exact iid and head has a validated max artifact.

If the command refuses (closed MR, ineligible, etc.), stop and report that.
Do not invent a replacement correctness review.

### 2. Approach pass

```
/mr-review <iid>
```

Follow the installed `mr-review` skill's SKILL.md exactly. Highlights this
workflow must not weaken:

- Stop if max-pass findings for this MR and current head are missing from both
  the conversation and the pinned artifact
- Stop if `gl-mr` diff overflows / truncates
- Derive approaches **before** reading the diff
- Write drafts under `.review/mr-<iid>/<full-head-sha>/` with `<!-- mr-review:<head-sha> -->`
- Dry-run `gl-note`, print full note bodies, then **checkpoint** before publish

### 3. Checkpoint — publish review notes (push right)

`/mr-review` already offers: post everything, summary only, or nothing. That
**is** this checkpoint. Brief content is the printed note bodies + dry-run
result; do not add a second confirm layer.

On "nothing": workflow may still continue to human merge decision, or stop if
the operator only wanted a private review.

If notes for the same head SHA already exist on the MR, `/mr-review` posts
nothing — treat as success for the publish step and continue.

### 4. Decide fix path

After findings exist (posted or kept local), brief the operator:

- Verdict line from mr-review
- Count of `[bug]` / `[approach]` / `[nit]`, how many blocking
- When more than one safe next path remains, use `SKILL.md`'s **Human decision
  brief** to explain the trade-offs before asking.
- Choices: (a) run `/address-comments <WORK-ITEM-KEY>` when the MR was
  factory-built and comments are on the forge, (b) author fixes manually, (c) merge
  as-is, (d) abandon / escalate to humans

Do not merge. Do not resolve the forge threads.

### 5. Optional — address comments

If (a) and work-item key present:

```
/address-comments <WORK-ITEM-KEY>
```

Factory: classify → action/dispute/answer/skip → reply once per thread →
cumulative Opus holdout → leave the MR draft under `[addressed !N]` or
escalate. Never merges. Never undrafts. A new head still needs the dual
Stage 3 pass before it may leave draft.

If the branch moves (new head SHA) and the operator wants another review pass,
restart from step 1 in this or a fresh conversation. Pinned artifacts make a
fresh conversation valid; a new SHA always requires a new max pass.

### 6. Done

Workflow is done when the operator states they are ready to merge (or abandon).
**Merge and `/openspec-archive` are human exits**, not steps this workflow runs:

1. Human merges the MR in the forge
2. Human runs `/openspec-archive <change-name>` in the target repo
3. Human updates tracker status if their team process requires it

## Handoff

| Artifact | Consumer |
|----------|----------|
| `.review/mr-<iid>/<full-head-sha>/` | Pinned review brief and audit trail |
| Posted `gl-note` threads | Authors / `/address-comments` |
| Operator "ready to merge" | Human merge + archive |

## Failure modes

| Condition | Action |
|-----------|--------|
| Empty / non-numeric iid | Ask for iid; stop |
| No current max-pass findings in conversation | Tell operator to run `/code-review-max !<iid>` in this runtime or native `/code-review max !<iid>` in the runtime; stop |
| Only the runtime `/code-review` findings exist | Reject them: the lightweight command has no max fan-out or freshness stamp |
| Correctness marker names another iid or head SHA | Treat it as stale and restart at step 1 |
| `gl-mr` meta/diff failure or overflow | Report verbatim; stop |
| address-comments: no open MR / escalate | Stop with factory reason; no fake ready |
| Operator uses another review skill instead of a max pass | Invalid for this chain; `/mr-review` will refuse — redirect to step 1 |

## Out of scope

- Creating the MR (see [`ticket-to-mr`](ticket-to-mr.md))
- Auto-merge, auto-archive, the tracker transitions
- Substituting a lightweight review for the max correctness pass or `/mr-review`

## Implementer notes

1. Enforce same-conversation ordering: code-review-max → mr-review in this runtime,
   or native code-review max → mr-review in the runtime.
2. Do not batch `gl-note` to skip permission prompts; mr-review requires per-note prompts.
3. Wire address-comments only when work-item key is known; otherwise stop after review with a brief that asks for the key or manual fix.
