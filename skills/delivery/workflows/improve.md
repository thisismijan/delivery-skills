# Improve delivery

Approval-gated self-improvement for the delivery skill. It turns accepted,
evidence-backed retro lessons into an isolated candidate, proves the candidate
against the current skill, and installs it only after the operator approves that
exact candidate.

This workflow may change only the delivery skill, its bundled workflows, and its
contract tests. Improvements to this delivery pack, factory skills, target repositories,
review skills, CI, or the tracker remain ordinary tickets or merge requests.

## Inputs

| Command | Action |
|---------|--------|
| `/delivery improve <KEY>` | Prepare candidates from one run's accepted lessons |
| `/delivery improve all` | Prepare candidates from qualifying accepted lessons across all ledgers |
| `/delivery improve status` | List state-root candidates and versions; report leftover skill-local copies; make no changes |
| `/delivery improve apply <candidate>` | Approve and install that exact candidate |
| `/delivery improve reject <candidate>` | Reject that candidate |
| `/delivery improve rollback <version>` | Approve restoring one exact version |

Bare `/delivery improve` uses the run already established in the conversation;
otherwise ask for a key or `all`.

## Storage

Improvement state uses the same root as the run ledger: `DELIVERY_STATE_ROOT`
when set, otherwise `<target repo>/.delivery/`. Resolve it with
`resolveStateRoot` in `factory/scripts/improvement-state.ts`. Paths below are
relative to that state root. Nothing is written beside the installed skill.

```text
<state root>/candidates/<candidate>/
  manifest.md
  patch.diff
  scorecard.md
  paired-plan.json
  paired-evidence.json
  paired-result.json
  skill/               # complete candidate delivery skill
<state root>/versions/<utc>-<baseline-hash>/
  skill/               # complete rollback copy
```

Candidate id: `improve-<yyyymmdd>-<short-class-slug>`. If it exists, add `-2`,
`-3`, and so on. After the checkpoint, the candidate's `skill/`, `patch.diff`,
and `scorecard.md` are immutable. Status transitions are appended to
`manifest.md`; existing lines are never edited. Version folders are fully
immutable. Never overwrite a candidate or version.

The manifest records:

- candidate id and creation time;
- exact baseline hash;
- source ledger Lessons lines and evidence links;
- mistake class, intended behaviour, scope, and non-goals;
- files changed;
- the new regression test and its expected baseline failure;
- status: `awaiting-approval`, `installed`, `rejected`, `superseded`, or
  `failed`;
- installation or rejection decision when terminal.

Do not copy transcripts, ticket bodies, MR discussions, secrets, personal data,
or product source into these folders. Link sanitized evidence.

## Status

`/delivery improve status` lists candidates under `<state root>/candidates/`
and versions under `<state root>/versions/`. Apply and rollback use only those
state-root folders. It makes no changes.

If leftover `candidates/` or `versions/` entries exist beside the installed
skill, status reports each leftover with the state-root path it should be migrated to.
Run `detectLegacyState` from `factory/scripts/improvement-state.ts` against
the installed skill folder and the state root. Detection is read-only: nothing
is moved, copied, installed, or changed. A leftover copy is never eligible for apply or rollback.

## Baseline identity

Hash the bytes and relative paths of the managed tree in sorted order:

- `SKILL.md`;
- every file under `workflows/`;
- every file under `checks/`.

Use SHA-256 and record the full digest. Exclude `runs/`, `candidates/`, and
`versions/`. A candidate applies only to this exact baseline.

## Prepare

Preparation never edits the live managed tree.

### 1. Select evidence

Read the ledger Lessons entries and their linked primary sources. A class
qualifies only when:

- it occurred in at least two independent delivery runs; or
- one occurrence reached production; or
- one occurrence exposed a Critical security, data-loss, or governance gap.

The lesson must be accepted, target the delivery conductor or one of its bundled
workflows, and name a reproducible past case. A model's opinion, a hypothetical,
or elapsed time alone is not evidence.

Group equivalent lessons. Do not prepare a second candidate when an
`awaiting-approval` or `installed` candidate already covers the class.

### 2. Capture the baseline

Compute the baseline hash. Run the live contract suite:

```bash
BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test <skill>/checks/delivery-specs.test.ts
```

If it is not green, stop. Self-improvement never builds on an unproved baseline.

### 3. Build in isolation

Copy the complete managed tree to `<state root>/candidates/<id>/skill/`. Make all edits only
there.

Write the regression test first. It must encode the intended behaviour from the
evidence, not merely assert that new prose exists. Run the candidate test file
against the live baseline by setting `DELIVERY_SKILL_ROOT` to the live skill
folder and `DELIVERY_SKILLS_ROOT` to its parent skills folder. At least one new
assertion must fail for the expected reason. Existing assertions must not newly
fail.

Then implement the smallest candidate change and run the same test file with
`DELIVERY_SKILL_ROOT` set to `<state root>/candidates/<id>/skill/` and
`DELIVERY_SKILLS_ROOT` still set to the live parent skills folder. It must be
green.

Do not broaden the proposal, perform adjacent cleanup, weaken a test, remove a
gate, or reduce an approval requirement.

### 3a. Paired benchmark

Run one baseline/candidate pair before adversarial evaluation. Use the same
task fixture, exact model, environment, allowed context, tools, output contract,
timeout, and deterministic checks. The managed skill tree is the only variable:
the live tree is the baseline and the isolated candidate tree is the candidate.
When the lesson itself changes model routing, keep the controller, inventory,
task, and environment fixed; the resulting worker selection is then the
declared variable under test. Record hashes for every fixed input so an
unpaired or stale run fails closed.

Keep deterministic correctness and security checks hidden from both runs where
the runtime permits it. Record check identities and outcomes after both outputs
are fixed; never put expected answers into the worker prompt. For non-trivial
logic or a changed regression test, make one safe mutation that represents the
cited failure, prove the new test or hidden check catches it, then discard the
mutation. If a safe mutation cannot be made, record why in `scorecard.md`; do
not imply mutation coverage.

Record baseline and candidate values for:

- input and output tokens, or labelled character counts when token usage is
  unavailable, taken from `capture-usage.ts` rather than guessed;
- cost when the host wrote it into the captured usage file;
- wall time from the captured usage timer;
- repair or retry count;
- delivered code size;
- deterministic and hidden check results;
- mutation caught or not checked.

Quality is the gate: the candidate must retain at least 90 percent of baseline
utility, have zero Critical misses, pass all required deterministic and hidden
checks, and catch the required mutation. A smaller output, lower cost, faster
run, or smaller diff is diagnostic evidence only and never compensates for a
quality or safety failure. Persist the paired inputs, outputs, metrics, and
check evidence under the candidate directory and summarize them in
`scorecard.md`.

Write `paired-plan.json` with the shared model and timeout; paths to the task
fixture, environment description, allowed context, tool contract, output
contract, and optional model inventory; and paths to each run's managed tree,
captured usage file, gate-result file, and delivered outputs. Paths are relative
to the plan. Each gate-result file records `utility`, `criticalMisses`,
`repairAttempts`, the named visible and hidden `checks`, and the selected worker
model when routing changed. These are check outputs, not values inferred by the
generator.

Generate the evidence instead of transcribing hashes, usage, timings, costs, or
output sizes by hand:

```bash
bun "${FACTORY_ROOT}/scripts/generate-paired-evidence.ts" \
  "<state root>/candidates/<id>/paired-plan.json" \
  "<state root>/candidates/<id>/paired-evidence.json"
```

The generator hashes every fixed input and both managed trees, reads usage from
`capture-usage.ts`, reads quality outcomes from the gate-result files, and
measures delivered output bytes. It refuses missing wall time, incomplete usage,
symlinked artifacts, malformed checks, and evidence that does not satisfy the
paired schema. Then run the deterministic evaluator:

```bash
bun "${FACTORY_ROOT}/scripts/paired-evaluation.ts" \
  "<state root>/candidates/<id>/paired-evidence.json" \
  "<state root>/candidates/<id>/paired-result.json"
```

The evidence schema requires identical controls, comparable usage units, the
same named checks and visibility, a green baseline, and distinct managed-tree
hashes. For a routing change it also requires both selected worker models.
Malformed or unpaired evidence exits non-zero. A well-formed candidate that
misses the utility, Critical-miss, required-check, or mutation gate writes its
result and also exits non-zero. Either outcome marks the candidate `failed`;
do not calculate or override the decision in prose.

### 4. Adversarial evaluation

Use a bounded, read-only evaluation phase. In the runtime, run three fresh subagents
in parallel. In the runtime, a dynamic workflow may run the equivalent phase
when that runtime is enabled. The candidate must not depend on the runtime:
subagents remain the portable path.

Give every evaluator the same immutable brief: evidence, baseline hash,
candidate patch, tests, output schema, and no author reasoning. Require
structured output with `verdict`, `verifiedClaims`, `unverifiedClaims`,
`findings`, and `evidence` fields.

Use three independent lenses, no more:

1. **Evidence auditor:** does the lesson qualify, and would the candidate have
   prevented the cited past cases?
2. **Regression auditor:** does the new test fail on baseline and pass on the
   candidate for the stated reason, without weakening existing assertions?
3. **Safety auditor:** did any command, status, capability, approval, failure
   mode, privacy boundary, or rollback path become unreachable or weaker?

Then the main conversation adjudicates the structured outputs against the raw
artifacts. Reviewer agreement is not proof. A missing, null, stalled,
malformed, or unverified evaluator result is a failed evaluation, never a pass.

A finding or incomplete evaluation leaves the candidate `failed`; do not repair
and re-review in the same attempt. A later prepare creates a new candidate id.
Start with one candidate; never fan out candidate authoring across several
lessons until this bounded evaluation has succeeded.

### 5. Present the checkpoint

Write `patch.diff`, `manifest.md`, and `scorecard.md`. Show:

- candidate id and baseline hash;
- problem and linked occurrences;
- behavioural change and non-goals;
- full patch;
- baseline failing-test evidence;
- candidate passing-test evidence;
- paired baseline/candidate identities, quality result, hidden-check and
  mutation evidence, and efficiency deltas;
- adversarial verdict;
- rollback plan.

Ask exactly:

> Install `<candidate>` on baseline `<hash>`? Recommended: yes only if the
> evidence, patch, and changed behaviour above are correct.

Offer: apply, reject, or leave pending. End the turn. Silence, “looks good”, and
approval of another candidate do not count.

## Apply

`/delivery improve apply <candidate>` is approval for that candidate only.
Record the operator's exact command before changing the live skill.

1. Require candidate status `awaiting-approval`.
2. Recompute the live baseline hash. It must exactly equal the manifest's hash.
   If not, mark the candidate `superseded`; prepare a fresh candidate rather
   than merging generated changes.
3. Rerun the candidate contract suite. It must be green.
4. Copy the complete live managed tree to a new immutable
   `<state root>/versions/<utc>-<baseline-hash>/skill/` folder and verify its hash.
5. Install only the candidate managed tree. Never touch `runs/`, `candidates/`,
   or `versions/`. The candidate must already exist under
   `<state root>/candidates/`.
6. Run the live contract suite and verify the live hash equals the candidate
   hash. On either failure, restore the version immediately, verify the restored
   hash and tests, and mark the candidate `failed`.
7. Mark the candidate `installed` and record the version.

Stop after installation. Say that the current conversation still has the old
skill instructions loaded and that a new chat is required.

## Reject

`/delivery improve reject <candidate>` records the exact command and marks an
`awaiting-approval` candidate `rejected`. It changes no managed file. A rejected
candidate is never reopened or installed.

## Rollback

`/delivery improve rollback <version>` is approval to restore that exact
version. The version must already exist under `<state root>/versions/`.

1. Verify the version is complete and its recorded hash is correct.
2. Snapshot the current managed tree as another immutable version.
3. Restore the selected version, run the live contract suite, and verify its
   hash.
4. If verification fails, restore the just-created snapshot and report failure.
5. Record the rollback and stop; a new chat is required.

## Checkpoint

No candidate installation or rollback occurs without the operator's explicit
`apply <candidate>` or `rollback <version>` command. Approval is never inferred
from retro acceptance, chat sentiment, a passing scorecard, or `/delivery auto`.
Retro acceptance is not installation approval.

## Ledger writes

- Decisions: candidate prepared, rejected, superseded, failed, installed, or
  rolled back, with candidate/version id and evidence link.
- Approvals: the exact `apply <candidate>` or `rollback <version>` command,
  scoped to the recorded baseline hash.
- Lessons: after install, append which candidate addressed the class. Never
  edit the original lesson.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| No qualifying accepted lesson | No evidence-backed delivery improvement qualifies | `/delivery retro <KEY>` |
| Baseline tests fail | The current delivery skill is not a green baseline | Fix the baseline, then `/delivery improve <KEY>` |
| Candidate evaluation fails | Candidate `<id>` failed; live skill unchanged | Inspect its scorecard, then prepare a new candidate |
| Baseline moved | Candidate `<id>` targets an older delivery version | `/delivery improve <KEY or all>` |
| Install verification fails | Candidate failed and the previous version was restored | Inspect the candidate and rollback evidence |
| Rollback verification fails | Rollback failed and the pre-rollback version was restored | Inspect the version and test output |

## Never

- Edit the live managed tree while preparing or evaluating a candidate.
- Install, merge candidates, or rollback without exact operator approval.
- Let `/delivery auto` imply approval.
- Learn from generated summaries when primary evidence exists.
- Copy secrets, personal data, transcripts, or product source into the skill.
- Weaken or delete a test, gate, review requirement, approval, or safety rule.
- Modify this delivery pack, review skills, factory skills, target repositories, CI, the tracker,
  or the forge.
- Continue using newly installed instructions in the conversation that
  installed them.
- Apply or rollback a leftover copy found beside the installed skill.
