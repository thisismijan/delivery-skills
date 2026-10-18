# Intake

The bug on-ramp of the delivery conductor. It takes a bug report that nobody in
the loop wrote and decides whether it is ready for Stage 2. Tickets groom
created do not go through intake; groom already shaped them.

It ends with a recommended state and, for a real bug, a brief that draft can
work from. It never fixes the bug, and it changes nothing in the tracker.

## Inputs

- A work-item key.

## Preconditions

1. the tracker can be read. If not, stop: "cannot read <KEY>".
2. cwd is the target repo.
3. Open or create the ledger for the key (`delivery-ledger.md`).

## Steps

### 1. Read the report

Read the whole ticket: description, every comment, attachments, linked issues,
the environment, and the version it was seen in.

### 2. Is it already handled?

- **Duplicates.** Search the tracker, open and closed, for the same symptom by its
  domain terms, not the reporter's wording.
- **Already fixed.** Search merged MRs and recent commits for the symptom or
  the key.
- **Fix in progress.** If an open MR claims to fix it, switch to verifying that
  fix: reproduce on the default branch (step 5), run the same reproduction
  against the MR's branch, and report whether the MR fixes it. Then stop. Do
  not build a competing fix.

### 3. Was it rejected before?

Check the target repo's `.out-of-scope/` directory if it has one, and the tracker
won't-fix resolutions on the same concept. A match is a recommendation, not a
decision. Report it with its reason.

### 4. Is it a bug?

Classify the report as one of:

- **Bug**: the system does not do what it is specified or documented to do.
- **Enhancement**: the system does what was intended, and the reporter wants
  something else. Recommend `/delivery discover` or groom instead.
- **Support or config**: the system works, and the reporter's setup or use is
  wrong. Draft the answer.

Continue only for a bug.

### 5. Reproduce

No theories until there is a command that shows the bug.

1. Build the smallest command that fails on the current default branch because
   of this bug: a test, a script, an API call, or exact UI steps.
2. Run it twice. Both runs must show the bug. Capture the output.
3. If after a bounded effort you cannot reproduce it, stop here and recommend
   `needs-info`. Write exactly what you tried and the questions the reporter
   must answer.

### 6. Locate, lightly

The goal is a starting point for draft, not a fix.

1. Write 3 to 5 hypotheses, ranked by likelihood. Each states a prediction that
   would confirm or refute it.
2. Test the cheapest predictions first.
3. Stop at the most likely cause, marked `confirmed` (a prediction held) or
   `unconfirmed`.

If there is nowhere to test the behaviour without the whole system running,
say so. That is a finding about the code, and retro can use it.

### 7. Write the brief

The brief has to stay true while the code changes, so describe behaviour and
interfaces, not file paths or line numbers.

```markdown
## Current behaviour
<what happens, with the reproduction command and its output>

## Expected behaviour
<what should happen, and where that is specified or documented>

## Where it shows up
<endpoints, messages, screens, commands — the interfaces a user or caller sees>

## Likely cause
<hypothesis> — <confirmed | unconfirmed> — <evidence>

## Done when
- The reproduction command passes.
- <other acceptance points>

## Out of scope
```

### 8. Recommend a state

| State | When |
|-------|------|
| `ready` | Reproduced, and the brief is written |
| `needs-info` | Could not reproduce; questions written |
| `wont-fix` | Rejected before for a reason that still holds, or the cost outweighs the harm |
| `duplicate <KEY>` | Same problem as another key |

For each state, draft the comment the operator could post on the ticket. It
follows the human-facing output rules: plain language, no internal jargon, and
no AI or tool attribution.

## Checkpoint

The operator confirms the state.

- If evidence leaves two or more states genuinely viable, present them through
  `SKILL.md`'s **Human decision brief** before asking. Do not turn a
  deterministic classification or one viable state into an artificial choice.
- **`ready`**: draft reads the ticket, so the brief has to be on it. The
  operator posts it, or tells you to post it as one comment on this ticket.
  Then continue with Stage 2 for the key.
- **Every other state**: brief the operator and end.

## Ledger writes

- Keys: status `[triage: ready]`, `[triage: needs-info]`, `[triage: wont-fix]`,
  or `[triage: duplicate <KEY>]`.
- Decisions: the classification, the reproduction command, and the likely cause.
- Stops: any terminal stop.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Cannot read the tracker | Cannot read <KEY> | None |
| Fix in progress | !<iid> already addresses this; verified: <yes/no> | `/delivery <iid>` |
| Not a bug | <KEY> is an enhancement or a support question | `/delivery discover …` or none |

## Never

- Fix the bug in this stage.
- Transition, label, assign, close, or create work items.
- Post anything on the ticket without the operator's go-ahead.
- Put file paths or line numbers in the brief.
