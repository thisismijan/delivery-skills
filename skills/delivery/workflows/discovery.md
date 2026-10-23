# Discovery

Stage 0 of the delivery conductor. It turns a vague idea into a one-page brief
that groom can work from. Groom asks how to slice and build an idea; discovery
asks whether it is the right idea, what has been tried before, and what done
looks like.

It ends with a one-pager the operator approves with an explicit yes. It never
creates tickets, writes production code, or pushes branches.

## Inputs

- The idea: inline text, a file path, or a link.
- Or the id of an earlier discovery ledger (`discover-<yyyy-mm-dd>-<slug>`). That
  resumes it: read the ledger and its one-pager, and continue from the first
  step or map item that is not done.

## Preconditions

1. cwd is the target repo, so the code and its history can be searched.
2. Open or create the ledger with id `discover-<yyyy-mm-dd>-<slug>`
   (`delivery-ledger.md`). Add one Keys row with the ledger id as its key and
   status `[discovering]`.
3. Note which sources can be read: the selected work-item provider, Confluence, and any other connected
   sources. A source that cannot be read is recorded as a gap, not skipped.

## Steps

### 1. State the hypothesis

Write one sentence: "We believe <who> needs <outcome> because <evidence>. We
will know it worked when <signal>." Give your confidence as a percentage. Under
70%, say what would raise it.

Show it to the operator before going further. It is the first thing they can
correct.

### 2. Search for prior work

Create `.delivery/runs/<ledger-id>-discovery/`. Run one read-only subagent per
source, in parallel. Each searches by the idea's domain terms, not just its
wording, and writes a named evidence file (`code.md`, `tracker.md`,
`confluence.md`, `openspec.md`, or `adrs.md`). A
search that finds nothing is reported as a finding: "searched <where> for
<terms>, found nothing".

| Source | Look for |
|--------|----------|
| Code and git history | Code that already does part of this; reverted attempts; commits that mention the terms |
| selected work-item provider | Open, closed, and won't-fix items and groups on the same problem |
| Confluence | Designs, decisions, postmortems |
| OpenSpec | Current specs and archived changes in the target repo |
| ADRs | Decisions that constrain or contradict the idea |

Merge the results into four lists:

- **Preserve**: what exists and must keep working.
- **Change**: what the idea really needs to change.
- **Avoid**: what was tried and did not hold, and why.
- **Risk**: what could make this harder than it looks.

### 3. Interview

Ask the operator only for product intent the factory cannot discover. Decide
facts, probes, and cheap reversible defaults itself. An escalated choice
follows `SKILL.md`'s **Human decision brief**: options and trade-offs first,
then the withheld recommendation after they answer.

- When a remaining question asks the operator to choose among two or more
  viable product directions, first follow `SKILL.md`'s **Human decision brief**.
- Never ask for a fact you can look up. Look it up.
- A question you could answer by running something is not the operator's to
  answer. Write a throwaway probe in a scratch directory outside the repo, run
  it, and report the result. Probes are never committed or pushed.
- Cover, in whatever order the conversation needs: who it is for, the outcome
  they need, why now, the success signal, constraints, and what is out of scope.

Stop when the operator confirms you understand the idea, not when you run out of
questions.

### 4. Widen, then narrow

Do this step only if more than one direction is still credible.

1. Write 5 to 8 variations, each through a different lens: do the opposite,
   remove a constraint, 10 times the scale, the smallest useful version, reuse
   what exists, and do nothing.
2. Group them into 2 or 3 real directions.
3. Present those directions through `SKILL.md`'s **Human decision brief**,
   including the relevant DSA and system-design lenses.
4. Recommend one and say why the others lost, what the recommendation assumes,
   and what evidence would change it.

### 5. Check the size

Ask: could groom slice this in one session? If yes, go to step 6.

If not, write a **map** into the discovery one-pager:

- **Destination**: one sentence.
- **Decisions so far**: settled answers, each with its reason.
- **Not yet specified**: open questions. Write each as a question you could ask
  precisely today. Anything vaguer stays as "unclear: <area>".
- **Out of scope.**
- **Decision items**: each open question as one item, typed as interview,
  probe, research, or task, and marked as needing the operator or not.

Resolve one interview or probe item per session. Research items can run in
parallel as background read-only subagents. Run discovery again to continue the
map; the ledger says where it got to.

### 6. Write the one-pager

Save it as `.delivery/runs/<ledger-id>-discovery/one-pager.md` and link the
directory from the ledger header's `Discovery:` line. Later sessions may reuse
these files as hints after verifying referenced paths; they are never proof that
the live code or ticket is unchanged.

```markdown
# <destination>

## Problem
## Hypothesis
<the sentence from step 1, revised> — confidence <n>%
## Who it is for
## Success signal
## Direction
<chosen direction and why the others lost>
## Not doing, and why
## Assumptions to test
- <assumption> — how we will test it
## Risks
## Open questions
## Prior work
- <link> — what it tells us
## Map
<only if step 5 needed one>
```

## Checkpoint

The operator approves the one-pager with an explicit yes. "Sounds good",
"looks fine", and silence are not approval; ask again. Record the approval in
the ledger.

After approval, set the key status to `[discovered]`. The one-pager and named
source artifacts are the argument to Stage 1, including in a fresh session.

## Ledger writes

- Decisions: the chosen direction and every settled answer from the interview.
- Approvals: the one-pager approval with the operator's words.
- Stops: any terminal stop.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Operator stops | Idea parked at <step> | `/delivery discover <ledger id>` to resume |
| Already done | The idea is already delivered by <link> | None |
| Rejected before | The idea was rejected in <link> for <reason> | Operator decides whether to reopen |

## Never

- Create a remote or local work item. Groom and the conductor do that behind
  their own gates.
- Commit or push a probe.
- Start drafting an OpenSpec change.
- Treat a search that found nothing as a search that was not run.
