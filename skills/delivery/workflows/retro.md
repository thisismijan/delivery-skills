# Retro

Stage 6 of the delivery conductor. It looks back over a ticket or a whole epic
and proposes changes to the **environment** the work ran in: groom, draft, the
factory's gates, the reviewers, the conductor, and the target repo's checks. It
does not propose changes to the product code that shipped.

It also writes an educational engineering postmortem: a problem-solving
narrative that reconstructs the attempts, failures, pivots, and final design,
then extracts lessons about data structures, algorithms, and system design.
This is a learning artifact, not an incident report and not a changelog.

It proposes; it applies nothing. Each accepted proposal outside the delivery
skill becomes its own ticket or MR through the normal process, in a later
session. An accepted proposal targeting the delivery skill becomes evidence for
the separate approval-gated `/delivery improve` workflow.

## Inputs

- A Jira key. A ticket key scopes the retro to that ticket. An epic key scopes it
  to every key in the epic's ledger.

## Preconditions

1. **Ledger.** Find it (`delivery-ledger.md`). No ledger is a terminal stop:
   "no delivery record for <KEY>; a retro needs one".
2. **Something finished.** At least one key in scope is `[merged !N]`,
   `[verified !N]`, `[regressed !N]`, or `[stopped: <reason>]`. Otherwise stop:
   "nothing in <KEY> has finished yet".

## Primary sources

Read the record of what happened, not anyone's summary of it. For each key in
scope, read whatever exists of the following; a source that exists but cannot be
read is recorded as a gap.

- The ledger: decisions, stops, approvals, and voided verdicts.
- The factory's record of the run: stage results, gate failures, holdout
  verdicts, escalations, reruns, and continues.
- The MR: review threads, which findings were acted on and which were dismissed,
  address-comments rounds, and commits pushed after the first review.
- The readiness brief and the post-merge verify result.
- The Jira ticket's comments.
- Transcripts of the delivery sessions, if the operator points to them.
- Earlier retros: the Lessons section of every ledger in the ledger directory
  (`delivery-ledger.md`).

## Steps

### 1. Build the timeline

For each key: when each stage started and ended, how many factory runs, how
many review rounds, which verdicts were voided, and every terminal stop.

### 2. Reconstruct the engineering story

Follow the evidence through commits, diffs, gate results, review findings, and
operator decisions. Reconstruct the sequence rather than describing only the
final code:

1. **The problem.** State the concrete input, required output, constraints, and
   why the obvious solution was not enough.
2. **The first model.** Explain the initial representation and approach. Name
   its assumptions before judging it.
3. **The failure.** Give the smallest counterexample, test, production signal,
   or review finding that disproved an assumption. Distinguish observed evidence
   from inference.
4. **The evolution.** For every material pivot, use the chain:
   `attempt → evidence of failure → changed model → result`.
5. **The final design.** Explain the representation, invariants, boundaries,
   and why this design survived cases that defeated the earlier attempts.

Do not invent an abandoned approach because the final implementation has only
one visible form. If history is incomplete, label the gap. Do not quote private
reasoning from a transcript when the same fact is available in code or a test.

### 3. Analyse DSA and system design

Treat this as a compact case study for an engineer learning how to choose a
model, not as a catalogue of terminology.

#### Data structures and algorithms

- Name the actual data representation and the operations that dominate.
- State the invariant each important structure maintains.
- Explain why it fits better than the nearest plausible alternative.
- Give time and space complexity for the important path, including relevant
  bounds such as files, comments, rows, graph nodes, or requests.
- Identify adversarial and boundary cases and the test that covers each.
- If no meaningful algorithm or data-structure choice exists, write
  `No material DSA decision in this change` and explain why. Never retrofit a
  textbook algorithm onto ordinary application plumbing.

#### System design

- Draw the request, event, or data flow across components and trust boundaries.
- Explain ownership of state, consistency model, concurrency control,
  idempotency, failure handling, retries, timeouts, and recovery.
- Describe compatibility and rollout concerns: old/new versions, contracts,
  migrations, observability, and rollback.
- Name the chosen trade-off in concrete terms, including what became cheaper
  and what became more expensive.
- Separate current measured limits from hypothetical scale concerns.

### 4. Write the learning postmortem

Write `.delivery/runs/<run-id>-postmortem.md` and link it from the ledger's
Decisions section. Use this structure:

```markdown
# Engineering postmortem: <problem>

## Problem and constraints
## Attempt 1: <model>
### Why it looked reasonable
### Counterexample or failure
## Design evolution
### Attempt 2: <changed model>
### What the evidence changed
## Final design
### Representation and invariants
### Component and data flow
## DSA analysis
### Operations and complexity
### Boundary and adversarial cases
## System-design analysis
### State, consistency, and concurrency
### Failure handling and recovery
### Compatibility, rollout, and observability
## Alternatives not taken
## Reusable lessons
## Exercises for the reader
```

Use as many numbered attempt sections as the evidence supports. Every claim
about an attempt or failure links to a commit, diff, test, gate artifact, review
thread, or decision. Keep code excerpts short. End with two to five questions
that ask the reader to vary a constraint, construct a counterexample, or defend
an alternative design.

The prose should be direct and chronological: problem, attempted model,
counterexample, revised model, resulting trade-off. Do not imitate any named
author's wording or verbal mannerisms.

### 5. Find the corrections

A **correction** is any moment where something had to fix the work after a
stage handed it on. Examples:

- A factory gate failed: green gate regression, honesty gate, coverage gate,
  holdout.
- A review finding was acted on.
- The operator corrected a stage's output.
- A readiness NO-GO.
- A post-merge regression.

For each correction, record what happened, which stage *should* have caught it,
and which stage *did*.

### 6. Group corrections into mistake classes

Group corrections that share a root cause into a class. Name the class by the
mistake, not the symptom: "draft omits the down path for migrations", not
"migration review comment".

A class **qualifies** for a proposal when it has occurred twice or more, counting
this scope and earlier Lessons together. A single occurrence is recorded in
Lessons as `candidate` and not acted on, unless it reached production.

### 7. Choose the fix level

For each qualifying class, choose the highest level that would have stopped it:

1. **Pipeline structure.** Stage order, a new stage, a new factory gate.
2. **Schema or types.** For example the skill registry schema, the result
   contract, or the OpenSpec templates, so the mistake cannot be expressed.
3. **Deterministic check.** A lint rule, hook, CI guard, or factory hook. Its
   error message names the fix.
4. **Test.**
5. **Review standard.** A rule for the holdout reviewer or `/mr-review`. Use
   this only for judgement calls no check could make, such as consistency
   across files.
6. **Docs or steering text.** Last, and only when nothing above applies.

Also look for the opposite: steering text, rules, or gates that fired on nothing
in this scope and earlier retros. Propose removing them.

### 8. Prove each proposal

A proposal is only credible if it would have caught a real past case. For each:

- The correction it would have caught, linked.
- How to prove that: the check fails on that past commit or diff, or the review
  rule flags that past finding.
- Where it goes: ig-spec groom, draft, or execute; a factory gate; review
  standards; the conductor or a workflow spec; or the target repo.
- What it costs: runtime per job, false-positive risk, maintenance.

If the target repo guards its contributor rules with tests, the proposal says so.
Dark-factory does this in `test/conventions.test.ts`, so a rule change there
ships with that test kept green.

### 9. Track dismissed findings

For each review finding that was dismissed as not a problem, record its pattern
with a confidence level:

- `candidate`: dismissed once.
- `recurring`: dismissed twice.
- `strong`: dismissed three times or more.

A `strong` pattern becomes a proposal: tell the reviewer not to raise it, with
the dismissals as evidence.

### 10. Present

List proposals most severe first: production regressions first, then by how
many corrections each would have prevented. For each, give the class, its
occurrences, the fix level, the proof, the target, and the cost. Then ask the
operator to accept, reject, or backlog each one.

For each accepted proposal, write the ticket text: a title and description the
operator can paste into Jira. The text follows the human-facing output rules.
For an accepted proposal whose target is the delivery skill or a bundled
workflow, write instead:

- the exact qualifying Lessons lines;
- links to the primary evidence;
- the behaviour that should change and explicit non-goals;
- `Next: /delivery improve <KEY or EPIC>`.

Retro never drafts or installs the candidate.

## Checkpoint

The operator decides each proposal. Nothing is applied in this session.
Accepting a proposal approves investigation, not a patch and not installation.

## Ledger writes

- Decisions: link the engineering postmortem and its evidence scope.
- Lessons: one line per class, including candidates, with its decision.
- Lessons: one line per dismissed-finding pattern with its confidence.
- Keys: status `[retro done]` for every key in scope that had finished.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| No ledger | No delivery record for <KEY> | None |
| Nothing finished | Nothing in <KEY> has finished yet | `/delivery status <KEY>` |

## Never

- Edit ig-spec, the factory, review standards, contributor rules, or the
  conductor in this session.
- Treat acceptance of a retro proposal as approval to install an improvement.
- Create Jira issues. Write the text; the operator creates them.
- Attribute a mistake to a person. Classes describe the environment.
- Propose a check you cannot show would have failed on a real past case.
