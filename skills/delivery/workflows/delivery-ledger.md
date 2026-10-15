# Delivery ledger

The run ledger is the conductor's memory. A delivery run lasts days and crosses
sessions, worktrees, and people, so nothing that matters may live only in chat.
Every stage reads the ledger before acting and writes to it before handing back.

## Location and identity

- Directory: the `runs/` folder next to the delivery skill's SKILL.md. It syncs
  with the skill, so the operator's Mac and cloud agents read and write the same
  ledgers.
- Self-improvement candidates and rollback copies live beside `runs/`, under
  `candidates/` and `versions/`. Ledgers link to their manifests; they never copy
  patches or evaluation output into Lessons.
- One file per run. The file name is the first stable id the run had: the epic
  key, a lone ticket key, or `discover-<yyyy-mm-dd>-<slug>` for a run that
  started in discovery.
- The `Ids:` header line lists every id the run is known by. When groom creates
  the epic for a discovery run, add the epic key to `Ids:`; do not rename the
  file.
- To find the ledger for a key, search the headers:
  `rg -l '^Ids:.*\bMDF-1234\b' <skill folder>/runs/`.
  No match means no ledger yet. More than one match is a terminal stop: name the
  files and ask the operator which one is live.

## Format

```markdown
# <one-line destination>

Ids: <EPIC-or-first-id>[, <more ids>]
Target repo: <path or remote URL>
Created: <yyyy-mm-dd>
Discovery: <link to the discovery one-pager, if any>

## Keys

| Key | Title | Stage | MR | Blocked by | Status |
|-----|-------|-------|----|------------|--------|

## Verdicts

| Date | MR | Kind | Head | Base | Patch-id | Verdict | By |
|------|----|------|------|------|----------|---------|----|

## Decisions

- <yyyy-mm-dd> <key or "run"> — <decision> — <why> — <evidence link>

## Approvals

- <yyyy-mm-dd> <scope> — <what was approved> — <who> — "<operator's words>"

## Stops

- <yyyy-mm-dd> <key> <stage> — <terminal stop reason> — <next command>

## Lessons

- <yyyy-mm-dd> <class> — <occurrences> — <proposal> — accepted | rejected | backlog
```

## Verdict kinds

| Kind | Written by | Verdict values |
|------|------------|----------------|
| `review` | The conductor, after Stage 3 ends | `ready`, `not-ready` |
| `readiness` | Stage 4 | `go`, `no-go` |
| `verify` | Stage 5 | `verified`, `regressed`, `inconclusive` |

A `verify` row records the deployed commit in Head, and leaves Base and Patch-id
empty.

## Write rules

- **Keys** is current state. Update a row in place when its stage or status
  changes. Its history lives in the other sections.
- **Verdicts, Decisions, Approvals, Stops, Lessons** are append-only. Never edit
  or delete an entry. Correct one by appending a new entry that says what it
  supersedes.
- Link artifacts; never copy them in. An MR, an OpenSpec change, a Jira ticket,
  or a brief is a link.
- Never write a secret, token, or credential into the ledger.
- Dates are UTC `yyyy-mm-dd`. SHAs and patch-ids are written in full, so a later
  comparison is exact.

## Reconciling with real state

On opening a ledger, before acting:

1. For every key with an MR, read the MR's state. `merged` or `closed` wins over
   whatever the ledger says; update the Keys row and append a Decision line
   `reconciled: <old status> → <new status>`.
2. For every key without an MR, read the Jira status. Do not change Jira; only
   record what it says if it disagrees with the ledger.
3. If the target repo's default branch has moved past a recorded verdict's base,
   that alone does not void the verdict. Freshness is decided only by the
   patch-id check below.

## Approvals

An approval counts only when it is recorded here. Chat history is never evidence
of approval.

- **Scope** is exact: a key, an MR iid, or an MR iid at a head SHA. An approval
  for one scope never covers another.
- Record the operator's words in quotes. "Looks fine" and "sounds good" are not
  approvals; ask for a yes and record that.
- An accepted risk is an approval. Its scope is the MR iid at the head SHA the
  risk was assessed on.
- An improvement approval is valid only when the operator invokes
  `/delivery improve apply <candidate>` or
  `/delivery improve rollback <version>`. Scope includes that exact id and the
  full baseline hash from its manifest. Accepting a retro proposal, saying
  “yes” without the id, or running `/delivery auto` is not installation
  approval.

## Verdict freshness

A verdict (review, readiness, verify) is given on one exact change. It stays
valid only while that change is unchanged.

Compute the patch-id of an MR from local git, without the forge:

```bash
git fetch origin <target_branch> <source_branch>
base=$(git merge-base origin/<target_branch> origin/<source_branch>)
head=$(git rev-parse origin/<source_branch>)
patch=$(git diff "$base" "$head" | git patch-id --stable | cut -d' ' -f1)
```

Record `head`, `base`, and `patch` in the Verdicts table. Later, recompute and
compare:

| Head | Patch-id | The verdict |
|------|----------|-------------|
| same | same | holds |
| different | same | holds for the code. Re-check the pipeline and mergeability at the new head; they can change after a rebase |
| any | different | is void. Re-run the stage that gave it |

An empty diff (`patch` is empty) is a terminal stop: the MR has nothing to judge.

## Status tags

The Keys table's Status column uses only these tags.

| Tag | Set by | Meaning |
|-----|--------|---------|
| `[discovering]` | Stage 0 | Discovery is open; no tickets yet |
| `[triage: needs-info]` | Intake | Waiting on the reporter; the questions are in the ledger |
| `[triage: ready]` | Intake | Reproduced and briefed; ready for draft |
| `[triage: wont-fix]` | Intake | Recommended not to fix; reason in Decisions |
| `[triage: duplicate <KEY>]` | Intake | Same problem as another key |
| `[groomed]` | Stage 1 | Ticket exists with its blocking edges |
| `[drafted]` | Stage 2 | OpenSpec change exists |
| `[executing]` | Stage 2 | Factory run dispatched |
| `[ready !N]` | Stage 3 | Review passed at a recorded head |
| `[go !N]` | Stage 4 | Readiness GO at a recorded head |
| `[no-go !N]` | Stage 4 | Readiness NO-GO; blockers in the brief |
| `[merged !N]` | Reconcile | The MR is merged |
| `[verified !N]` | Stage 5 | Deployed change proven on the live surface |
| `[regressed !N]` | Stage 5 | Deployed change broke something; brief in the ledger |
| `[retro done]` | Stage 6 | Lessons recorded |
| `[stopped: <reason>]` | Any | Terminal stop; reason and next command in Stops |
| `[waiting: <what>]` | Auto | Waiting on a pipeline, a deploy, or a person; resume with `/delivery auto <KEY>` |
