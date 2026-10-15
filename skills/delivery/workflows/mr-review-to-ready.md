# Workflow: mr-review-to-ready

Second-line review of a ready GitLab MR: correctness pass, then approach pass,
optional publish, then optional factory comment-fix loop until the human is
ready to merge. In Cursor compose `/code-review-max` and `/mr-review`; in
Claude Code compose native `/code-review max` and `/mr-review`. When fixing,
compose `/address-comments`. Do not reimplement their phases.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a ready MR needs the dual review chain and any resulting fixes before
a human merges.

## Trigger

**Event:** operator supplies a GitLab MR **iid** (integer, e.g. `740`) in a
Cursor or Claude Code session with cwd = **target repo** (so `gl-mr` resolves
the project from `origin`).

Optional: Jira key for the same change, needed only if `/address-comments`
will run.

## Preconditions

- `gl-mr` and `gl-note` on `PATH` (`~/.local/bin`); token at `~/token` (or
  `GL_TOKEN_FILE`)
- MR is open and fetchable: `gl-mr <iid> meta` succeeds
- For the address-comments path: ig-spec loaded, open MR on the spec branch,
  Jira key known
- **Same conversation** must hold both review passes: `/mr-review` reads the
  stamped correctness findings from this thread and will not substitute its
  own correctness pass

## Steps

### 1. Correctness pass

Cursor:

```
/code-review-max !<iid>
```

Claude Code:

```
/code-review max !<iid>
```

Example in Cursor: `/code-review-max !740`.

Leave findings in the conversation. Do not skip ahead to `/mr-review` if this
did not run for this same iid and current head SHA in this conversation.

If the command refuses (closed MR, ineligible, etc.), stop and report that.
Do not invent a replacement correctness review.

### 2. Approach pass

```
/mr-review <iid>
```

Follow the `mr-review` skill's SKILL.md exactly: `~/.claude/skills/mr-review/SKILL.md`
on the Mac, or `skills/mr-review/SKILL.md` in the Cursor skill store in a cloud
agent. Highlights this workflow must not weaken:

- Stop if max-pass findings for this MR and current head are missing from the
  conversation
- Stop if `gl-mr` diff overflows / truncates
- Derive approaches **before** reading the diff
- Write drafts under `.claude/review/mr-<iid>/` with `<!-- mr-review:<head-sha> -->`
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
- Choices: (a) run `/address-comments <JIRA-KEY>` when the MR was
  factory-built and comments are on GitLab, (b) author fixes manually, (c) merge
  as-is, (d) abandon / escalate to humans

Do not merge. Do not resolve GitLab threads.

### 5. Optional — address comments

If (a) and Jira key present:

```
/address-comments <JIRA-KEY>
```

Factory: classify → action/dispute/answer/skip → reply once per thread →
cumulative Opus holdout → re-mark ready or escalate. Never merges.

If the branch moves (new head SHA) and the operator wants another review pass,
restart from step 1 in this or a fresh conversation (mr-review requires
max-pass findings in-thread for the new SHA).

### 6. Done

Workflow is done when the operator states they are ready to merge (or abandon).
**Merge and `/openspec-archive` are human exits**, not steps this workflow runs:

1. Human merges the MR in GitLab
2. Human runs `/openspec-archive <change-name>` in the target repo
3. Human updates Jira status if their team process requires it

## Handoff

| Artifact | Consumer |
|----------|----------|
| `.claude/review/mr-<iid>/` | Audit trail; optional re-post after SHA move |
| Posted `gl-note` threads | Authors / `/address-comments` |
| Operator "ready to merge" | Human merge + archive |

## Failure modes

| Condition | Action |
|-----------|--------|
| Empty / non-numeric iid | Ask for iid; stop |
| No current max-pass findings in conversation | Tell operator to run `/code-review-max !<iid>` in Cursor or native `/code-review max !<iid>` in Claude Code; stop |
| Only Cursor `/code-review` findings exist | Reject them: the lightweight command has no max fan-out or freshness stamp |
| Correctness marker names another iid or head SHA | Treat it as stale and restart at step 1 |
| `gl-mr` meta/diff failure or overflow | Report verbatim; stop |
| address-comments: no open MR / escalate | Stop with factory reason; no fake ready |
| Operator uses another review skill instead of a max pass | Invalid for this chain; `/mr-review` will refuse — redirect to step 1 |

## Out of scope

- Creating the MR (see [`ticket-to-mr`](ticket-to-mr.md))
- Auto-merge, auto-archive, Jira transitions
- Substituting a lightweight review for the max correctness pass or `/mr-review`

## Implementer notes

1. Enforce same-conversation ordering: code-review-max → mr-review in Cursor,
   or native code-review max → mr-review in Claude Code.
2. Do not batch `gl-note` to skip permission prompts; mr-review requires per-note prompts.
3. Wire address-comments only when Jira key is known; otherwise stop after review with a brief that asks for the key or manual fix.
