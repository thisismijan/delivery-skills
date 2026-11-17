## Why

During `/groom` grilling, the operator's picks are recorded as given. When a pick contradicts what the codebase explorer found, the operator may never have seen that evidence, and the contradiction surfaces only later in `/draft` or `/execute`, where it is expensive. The explorer's report also lives only in the conversation, so nothing can cite it later or check a citation.

## What Changes

- Persist the explorer's report beside the decisions log, one appended section per groom session, so a challenge has evidence it can quote and a script can check, and earlier quotes stay checkable after a re-run
- When an operator pick contradicts that evidence, groom challenges it once before recording it, quoting the evidence word for word
- Record the challenge and the operator's final decision together in `decisions.md`, as five fixed, consecutive labelled lines that fit how the log is really written
- Add a small check script that refuses a malformed or decorated challenge entry, a quote that is not in the report, a decision that does not match the final pick, and a question challenged twice in one section, and ignores everything else in the log
- Raise the challenge on the settled pick, after any withheld-recommendation reveal and change
- Groom never asks about a challenged pick again, never challenges the changed pick, and never challenges a pick it cannot quote contradicting evidence for

## Capabilities

### New Capabilities

- `groom-evidence-pushback`: the single evidence-based challenge in groom grilling, the persisted explorer report it cites, and the checkable challenge entry in `decisions.md`

### Modified Capabilities

None. The standing groom requirements live in `factory/specs/groom/spec.md`, outside the OpenSpec capability list, so this change states its own requirements instead of modifying them.

## Out of Scope

- Push-back during draft or any other stage
- Challenging a pick on grounds other than the explorer's evidence
- Overriding or blocking the operator's final pick
- Deciding by script whether a pick contradicts the evidence (that judgement stays with the groom command)

## Impact

- `skills/groom/SKILL.md` gains the report persistence in step 3, the skipped-explorer note in step 2a, the challenge rules in step 5, the check before drafts are written in step 8, and `groom-decisions.ts` in the Hard rules list of scripts Bash may run
- `factory/scripts/groom-decisions.ts` (new) checks challenge entries in `decisions.md` against the persisted report
- `factory/scripts/groom-decisions.test.ts` (new) covers the check
- `factory/scripts/workflow-contracts.test.ts` gains assertions that pin the groom skill wording
- `factory/agents/groom-explorer.md` is not changed: the explorer stays read-only and groom persists its report
