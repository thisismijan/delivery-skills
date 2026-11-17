## Why

The groom and draft skill descriptions say what the skills do, but not when they must not start. A host that matches a description can open a full grilling loop, or start authoring a change, when the operator only asked a question such as what a ticket means. Loading either skill is also treated as permission to run the whole workflow. Nothing keeps a stage skill honest about this, so the gap can return the next time a description is edited.

## What Changes

- The groom and draft descriptions each gain a start clause (what starts the skill) and a not-for clause (what must not start it, including a question about what a ticket means)
- Both skills gain a step 0 that confirms the request is a run. Loading the skill never authorises the workflow. A slash command (with or without an argument), a conductor dispatch, or a run that already has a run contract file is a named invocation and never gets the extra question. When a skill is loaded without being named and the request could be a question or a full run, it asks exactly one question before it writes anything tracked or dispatches any worker. Draft's answer to a question about a ticket may use step 1's read-only fetch
- The skill metadata check fails a covered stage skill whose description has no not-for clause, and names that skill. It reads the skill name with the same quote handling as the description, and reports a covered name that matches no skill in the pack
- The check covers `groom` and `draft` only. The other factory stages (`execute`, `address-comments`) are left out on purpose, because adding clauses to them is out of scope for this change

## Capabilities

### New Capabilities

- `stage-skill-triggers`: start and not-for clauses on the groom and draft descriptions, the confirm-before-run step in both skills, and the skill metadata check that requires a not-for clause on covered stage skills

### Modified Capabilities

None. The existing portable frontmatter rules in the skill metadata check are unchanged. This change adds one rule beside them.

## Out of Scope

- Adding not-for clauses to stage skills other than groom and draft
- Changing what groom or draft do once a full run is confirmed
- Asking more than one clarifying question

## Impact

- `skills/groom/SKILL.md` gets a new description and the heading `### Step 0: Confirm this is a run` before `### Step 1`
- `skills/draft/SKILL.md` gets a new description and the line `0. **Confirm this is a run.**` before `1. **Fetch the work item.**`
- `factory/scripts/skill-metadata.ts` gains the covered list `NOT_FOR_STAGE_SKILLS`, the readers `parseSkillName` and `parseSkillDescription`, the clause rule `hasNotForClause`, the pack-level check `coveredSkillIssues`, and one more issue in `skillMetadataIssues`
- `factory/scripts/skill-metadata.test.ts` gains the check scenarios, including a run over the real skills in the pack
- `factory/scripts/workflow-contracts.test.ts` gains assertions on the groom and draft wording and step order
