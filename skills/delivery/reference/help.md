# Command cheat-sheet

Run in the **target repo** cwd with this delivery pack loaded. This is everything:

```
/delivery auto [idea | KEY | iid]    # the whole lifecycle; stops only for your decisions
/delivery auto min|max <...>         # the same at a cheaper or a faster, deeper level
/delivery status [KEY]               # where everything is, and what to type next
/delivery doctor                     # live readiness and exact setup remedies
/delivery init                       # initialize this target repository safely

/delivery discover <idea>            # shape a vague idea into a one-pager
/delivery triage <BUG-KEY>           # take a bug report into the loop
/delivery groom <idea | file>        # slice into work items
/delivery draft <KEY>                # write the OpenSpec change
/delivery execute <KEY>              # build it (typing this is the approval)
/delivery review <iid> [KEY]         # code review + MR review
/delivery address <KEY>              # address review comments
/delivery ship <iid>                 # go/no-go brief with rollback plan
# you: approve the MR (auto lands it once green) or merge it yourself
/delivery archive <KEY>              # archive the OpenSpec change
/delivery verify <iid>               # check it on the deployed environment
/delivery retro <KEY | EPIC>         # lessons and proposed fixes
/delivery improve <KEY | all>        # prepare and evaluate a delivery-skill improvement
/delivery improve status             # list pending candidates and rollback versions
/delivery improve apply <ID>         # approve and install this exact candidate
/delivery improve reject <ID>        # reject this exact candidate
/delivery improve rollback <VERSION> # approve restoring this exact version

/delivery <KEY>                      # resume from the ledger; next legal step only
/delivery min|max <KEY>              # resume, checking the run's approved level
/delivery <iid> | <idea>             # review-only, or a full epic
/delivery help                       # this list
```

When `/delivery` was typed with no argument, show this list, then ask once:
idea, work-item reference, MR iid, or `auto`? Recommended: if the
conversation already has a clear reference or iid, use that.
