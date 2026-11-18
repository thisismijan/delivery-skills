# Fan-out brief

Read this when work moves to another worktree, worker, or person, including
each ready-now key that auto or the full-epic path fans out.

One brief per ready-now key. A brief missing a field is not emitted; say which
field is missing instead.

```
KEY         <WORK-ITEM-KEY> — <title>
GOAL        one sentence, the outcome
SCOPE       what is in, what is explicitly out
CONTEXT     links to the ledger, OpenSpec change, ADRs, blockers' MRs
ACCEPTANCE  how the operator will know it is done
VERIFY      the gates that must pass and where the evidence will be
FORBIDDEN   merge, work-item transitions, work outside SCOPE
START       git worktree add --detach <path> <full-base-sha> && cd <path> && /delivery <KEY>
```

Under `auto`, `START` ends with `/delivery auto <KEY>` instead.
