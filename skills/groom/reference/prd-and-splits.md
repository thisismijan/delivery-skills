# PRD synthesis and slice breakdowns

This applies only when Step 4's settled classification is a PRD-worthy initiative (Steps 6 and 7) or a split-worthy ask (Step 7); a single ticket never needs it.

## Step 6: the PRD, for a PRD-worthy initiative only

Synthesize the PRD **in memory**. It MUST contain these sections: Problem, Solution, User stories, Success criteria, Constraints / NFRs, Out of scope. It MUST NOT contain an `Implementation decisions` or `Test seams` section, and no prose describing how the change will be built or tested. Offer it in chat for review before proposing slices. Incorporate feedback, but write no file before slice approval.

## Step 7: the slice breakdown, for a PRD-worthy or split-worthy ask

Show a numbered list of the proposed vertical slices, each tied to **exactly one user story**, since a ticket never carries more than one. Every entry MUST give:

- **Title**: short and descriptive
- **Blocked by**: the numbers of the slices it depends on, or "Nothing"
- **Story covered**: the one user story, from the PRD or the grilling, that this slice delivers
- **Observable outcome**: the one behaviour this ticket leaves working
- **Acceptance criteria**: one to three Given/When/Then statements
- **Out of scope**: the nearest outcomes deliberately deferred

Then ask the operator to check:

- the granularity, where each slice deploys on its own and covers one user story;
- the dependencies between slices;
- whether any slice is missing.

If feedback requires choosing among two or more viable breakdowns, compare them
through the delivery conductor's **Human decision brief** before asking.

Every slice must pass the small-context budget in Step 7 of `SKILL.md`.

Prefer independently deployable vertical slices. A wide refactor may use an
explicit **expand-contract exception** only when compatibility requires a
temporary two-phase change; name the expand slice, contract slice, compatibility
window, and rollback boundary instead of hiding both phases in one oversized
ticket.
