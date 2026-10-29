# Delivery ledger

The run ledger is the conductor's memory. A delivery run lasts days and crosses
sessions, worktrees, and people, so nothing that matters may live only in chat.
Every stage reads the ledger before acting and writes to it before handing back.

## Location and identity

- Directory: `<target repo>/.delivery/runs/`. It belongs to the target worktree,
  is gitignored, and is the only live source of run state. Set
  `DELIVERY_STATE_ROOT` only when a shared durable volume is intentionally used.
- Self-improvement candidates and rollback copies live under the same state root,
  in `candidates/` and `versions/`. Ledgers link to their manifests; they never copy
  patches or evaluation output into Lessons. Leftover skill-local copies are
  reported by `/delivery improve status` with their destination under this state
  root. They are never installed from beside the skill.
- One file per run. The file name is the first stable id the run had: the epic
  key, a lone ticket key, or `discover-<yyyy-mm-dd>-<slug>` for a run that
  started in discovery.
- The `Ids:` header line lists every id the run is known by. When groom creates
  the epic for a discovery run, add the epic key to `Ids:`; do not rename the
  file.
- To find the ledger for a key, search the headers:
  `rg -l '^Ids:.*\bMDF-1234\b' <target repo>/.delivery/runs/`.
  No match means no ledger yet. More than one match is a terminal stop: name the
  files and ask the operator which one is live.

## Format

```markdown
# <one-line destination>

Ids: <EPIC-or-first-id>[, <more ids>]
Target repo: <path or remote URL>
Created: <yyyy-mm-dd>
Generation: <non-negative integer>
Discovery: <link to the discovery one-pager, if any>
Run contract: <relative path> (sha256:<hex>)

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
- Link artifacts; never copy them in. An MR, an OpenSpec change, a work item,
  or a brief is a link.
- Never write a secret, token, or credential into the ledger.
- Dates are UTC `yyyy-mm-dd`. SHAs and patch-ids are written in full, so a later
  comparison is exact.
- Every mutation goes through the durable writer as compare-and-swap. Never
  edit the ledger file directly. Re-read `Generation`, write only if it still
  equals the generation originally read, and increment it once. A ledger with
  no `Generation` header counts as generation 0 and is stamped on that first
  write.
- Writer: `scripts/ledger-store.ts <root> <id> <expected-generation|-1> <input.md>`
  Run as `bun "${FACTORY_ROOT}/scripts/ledger-store.ts" <root> <id> <expected-generation|-1> <input.md>`.
- Recovery: `scripts/ledger-store.ts recover <root> <id>`
  Run as `bun "${FACTORY_ROOT}/scripts/ledger-store.ts" recover <root> <id>`.
  Run recovery only for a lock left behind. It clears a lock whose owner is
  gone on this host. A live owner, a foreign host, or an unreadable owner
  record is left in place.
- A concurrency conflict is a terminal stop, never a last-writer-wins merge.

### Parallel worker journals

An auto fan-out has one coordinator and one journal per key. The coordinator
reserves the wave in the run ledger before dispatch and remains the only run
ledger writer. Each worker receives the reserved generation and key row, then
writes only the path in `DELIVERY_WORKER_JOURNAL` under
`<state-root>/workers/<run-id>/`. It uses `ledger-store.ts` against that worker
directory for durable compare-and-swap writes. A worker must not search for or
mutate the run ledger.

The journal records stage status, MR iid, full commit SHAs, gate artifacts,
stops, and decisions for that key. After all workers settle, the coordinator
validates each journal against git and the forge and applies the wave's key
updates to the run ledger in one compare-and-swap write. Missing or conflicting
evidence stops only that key. Worker prose is never merged into the ledger.

When the coordinator closes a worker's worktree with `worktree-close.ts` and it
is kept, the coordinator appends `kept worktree <path> for <KEY>: <reasons>` to
Decisions. `/delivery status` lists every kept worktree that still exists, so
nothing uncommitted or unpushed is forgotten.

## Reconciling with real state

On opening a ledger, before acting:

1. For every key with an MR, read the MR's state. `merged` or `closed` wins over
   whatever the ledger says; update the Keys row and append a Decision line
   `reconciled: <old status> → <new status>`.
2. For every key without an MR, read the tracker status. Do not change the tracker; only
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
- `continuous-delivery: yes` is scoped to one run. Record either the exact
  `/delivery auto ...` invocation or the operator's explicit approval of the
  final groomed ticket or slice plan. It authorizes routine progression,
  isolated worktree fan-out, review-note publication, archive, verification,
  retro, and improvement preparation. It never authorizes merge, risk
  acceptance, a failed-gate override, tracker transitions, candidate
  installation, or rollback.   The same approval freezes
  `.delivery/runs/<id>.run-contract.json` against `SDLC-CONSTITUTION.md`.
  Later stages check that hash.
  A constitution or contract mismatch is a terminal stop. A new plan version
  must name the previous hash, the affected invariant, and a new explicit
  approval.
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
| `[discovered]` | Stage 0 | One-pager approved; ready for groom |
| `[triage: needs-info]` | Intake | Waiting on the reporter; the questions are in the ledger |
| `[triage: ready]` | Intake | Reproduced and briefed; ready for draft |
| `[triage: wont-fix]` | Intake | Recommended not to fix; reason in Decisions |
| `[triage: duplicate <KEY>]` | Intake | Same problem as another key |
| `[groomed]` | Stage 1 | Ticket exists with its blocking edges |
| `[drafted]` | Stage 2 | OpenSpec change exists |
| `[executing]` | Stage 2 | Factory run dispatched |
| `[reviewed-blocked !N]` | Stage 3 | Review found blockers at a recorded head |
| `[addressed !N]` | Stage 3, address-comments | Comments addressed at a recorded head; dual review not yet passed |
| `[ready !N]` | Stage 3 | Review passed at a recorded head |
| `[go !N]` | Stage 4 | Readiness GO at a recorded head |
| `[no-go !N]` | Stage 4 | Readiness NO-GO; blockers in the brief |
| `[merged !N]` | Reconcile | The MR is merged |
| `[verified !N]` | Stage 5 | Deployed change proven on the live surface |
| `[regressed !N]` | Stage 5 | Deployed change broke something; brief in the ledger |
| `[retro done]` | Stage 6 | Lessons recorded |
| `[stopped: <reason>]` | Any | Terminal stop; reason and next command in Stops |
| `[waiting: <what>]` | Auto | Waiting on a pipeline, a deploy, or a person; resume with `/delivery auto <KEY>` |
