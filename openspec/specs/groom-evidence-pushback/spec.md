# groom-evidence-pushback Specification

## Purpose
Challenge an operator's groom pick once, quoting the codebase explorer's persisted evidence word for word, when the pick contradicts that evidence, and record the challenge and the final decision so the quote can be checked later.

## Requirements

### Requirement: The explorer's report is persisted for citation, one section per session
After the `groom-explorer` returns its report, step 3 of `skills/groom/SKILL.md` SHALL have the groom command append that report word for word to `explorer-report.md` in the grooming output directory, under a heading `## Session <ordinal>`, before the first grilling question. The ordinal SHALL be one more than the number of `## Session` headings already in the file, and one when the file does not exist. Groom SHALL NOT overwrite or rewrite earlier sections, so a quote from an earlier session stays checkable. The explorer stays read-only, so groom writes the file, and it SHALL first require `groom-paths.ts verify` to accept the path. `explorer-report.md` is a run log like `decisions.md`, not a ticket draft, so it MAY be written before the operator approves the plan. A later session SHALL append its settled choices to `decisions.md` under a new `## ` heading, as the existing logs do. When step 2a skips the explorer, no section is appended and no pick is challenged in that session. Both step 2a shortcuts, the plain zero-exit one and the one that fills the housekeeping sections, SHALL record their `Agent decided:` line in `decisions.md`, so the decision log exists for the step 8 check. `factory/agents/groom-explorer.md` SHALL NOT change.

#### Scenario: The report is appended per session before grilling
- **GIVEN** the groom skill file
- **WHEN** steps 2a, 3, and 5 are read
- **THEN** step 3 says groom appends the explorer's report word for word under `## Session <ordinal>` in `explorer-report.md` after `groom-paths.ts verify` accepts the path and before the first grilling question, never overwrites an earlier section, and calls the file a run log that may exist before approval, a later session starts a new `## ` heading in `decisions.md`, and steps 2a and 5 say that when the explorer was skipped no section is appended and no pick is challenged, and both step 2a shortcuts record their `Agent decided:` line in `decisions.md`

### Requirement: A pick that contradicts the explorer's evidence is challenged once
Step 5 of `skills/groom/SKILL.md` SHALL tell groom that when the operator has settled a pick, which is after any reveal of a withheld recommendation and any change the operator makes then, groom compares that settled pick with `explorer-report.md`. When the report contains a passage that contradicts the pick, groom SHALL challenge the pick once, in its own turn, as its single question for that turn. Groom SHALL raise the challenge before that question's entry is appended to `decisions.md`, so the entry and the challenge lines are written together once the operator decides. The challenge SHALL quote that passage word for word, name the pick, and ask whether the operator keeps the pick or changes it. Groom SHALL challenge a pick only when it can quote such a passage. A pick that the report supports, or that the report says nothing about, SHALL be recorded without a challenge. A pick that was already challenged SHALL NOT be challenged again.

#### Scenario: A contradicting pick is challenged once with a quoted passage
- **GIVEN** the groom skill file
- **WHEN** step 5 is read
- **THEN** it says groom challenges a contradicting pick once, raising the challenge before that question's entry is appended, in its own turn as the only question of that turn, quoting the report's passage word for word, naming the pick, and asking keep or change

#### Scenario: The challenge follows the recommendation reveal
- **GIVEN** the groom skill file
- **WHEN** step 5 is read
- **THEN** it says the challenge applies to the pick settled after the withheld recommendation is revealed and any change is made, that the settled pick is the pick standing after the recommendation reveal and any change, so the challenged pick in the entry is the settled pick being challenged and not the pick as first given, and that the final pick in the challenge entry is the pick recorded after the challenge

#### Scenario: A supported pick is not challenged
- **GIVEN** the groom skill file and a decision log whose ordinary entries carry `Question:`, `Options:`, `Pick:`, `Withheld recommendation:`, `Differed:`, and `Agent decided:` lines but no challenge entry
- **WHEN** step 5 is read and the check runs on that log
- **THEN** the skill says groom challenges only when it can quote a contradicting passage and otherwise records the pick as usual, and the check accepts the log

### Requirement: The operator's decision after a challenge is final
Step 5 of `skills/groom/SKILL.md` SHALL tell groom to record whatever the operator decides after a challenge, whether the pick is kept or changed, together with the challenge. After that record, groom SHALL NOT ask about that pick again, SHALL NOT challenge the changed pick, and SHALL NOT block or override the final pick.

#### Scenario: The final pick stands without a second ask
- **GIVEN** the groom skill file
- **WHEN** step 5 is read
- **THEN** it says groom records the operator's decision with the challenge, moves on, never asks about that pick again, never challenges a changed pick, and never blocks or overrides the final pick

### Requirement: A challenge is recorded as a strict five-line entry
`decisions.md` SHALL record a challenge as an entry of exactly five consecutive lines, written directly after the `Differed:` line of that question's ordinary entry, with no decoration and no leading characters: `Challenged pick: <the settled pick being challenged>`, `Challenge question: <the question asked>`, `Evidence: "<passage>"`, `Operator decision: kept` or `changed`, and `Final pick: <the pick recorded after the challenge>`, in that order, each value non-empty. The entry ends after the `Final pick:` line; whatever follows, such as a blank line, an `Agent decided:` line, or the next heading, is not part of the entry and is not an error. The ordinary `Question:` lines are never read. The passage SHALL be the text between the first and the last double quote on the `Evidence:` line, which MAY contain double quotes, SHALL sit on that one line, and SHALL be non-empty. When the decision is `kept`, the final pick SHALL equal the challenged pick; when `changed`, it SHALL differ. `factory/scripts/groom-decisions.ts` (new) SHALL export `checkChallenges(decisionsText, reportText)` returning `ok`, a list of plain-language `problems`, and the number of entries, and SHALL export the marker, the label names, and `GROOM_DECISIONS_CHECK_INVOCATION`. Its `check` mode, run as `bun "${FACTORY_ROOT}/scripts/groom-decisions.ts" check "<output-dir>/decisions.md" "<output-dir>/explorer-report.md"`, SHALL print the result as JSON and exit 0 when the log passes and 1 when it does not. Missing arguments SHALL exit 2.

Fail closed on decoration: any line whose plain text starts with `challenged pick`, compared case-insensitively after stripping asterisks, backticks, and leading spaces, list markers, quote markers, and heading marks, SHALL be refused unless it is the first line of a well-formed five-line entry as defined above.

#### Scenario: A complete entry is accepted wherever it sits in a real log
- **GIVEN** a decision log in the shape groom writes, with ordinary `Question:` lines, a `kept` entry followed directly by an `Agent decided:` line, a `changed` entry followed directly by the next `## ` heading, a passage containing double quotes, and a passage whose spaces differ from the report only in repeated spaces
- **WHEN** `checkChallenges` runs on the log and a report whose passages appear in it
- **THEN** it returns ok with the number of entries, and the `check` mode exits 0

#### Scenario: A malformed entry is refused
- **GIVEN** an entry with a missing, empty, reordered, or duplicated line, an `Evidence:` value without two double quotes or with an empty passage, a following line that continues the passage, an `Operator decision:` value other than `kept` or `changed`, a `kept` decision whose final pick differs, or a `changed` decision whose final pick is the same
- **WHEN** `checkChallenges` runs
- **THEN** it returns not ok with a problem naming the line, and the `check` mode exits 1

#### Scenario: A decorated or lookalike marker is refused
- **GIVEN** a line such as `**Challenged pick:** X`, `- Challenged pick: X`, `Challenged Pick: X`, or an indented `Challenged pick: X`, or a well-formed marker line followed by fewer than four correct lines
- **WHEN** `checkChallenges` runs
- **THEN** it returns not ok naming the line, and the `check` mode exits 1

#### Scenario: The skill names the same marker and labels
- **GIVEN** the exported marker and label names in `factory/scripts/groom-decisions.ts` and the groom skill file
- **WHEN** step 5 of the skill is read
- **THEN** it contains the marker and each label exactly as exported, the `kept` and `changed` values, and the instruction to write the five lines directly after the `Differed:` line

### Requirement: A challenge must cite evidence in the report, once per question
`checkChallenges` SHALL refuse an entry whose passage, after runs of whitespace in the passage and in the report are collapsed to one space, does not appear anywhere in the report text; case and wording SHALL match exactly. The report text is the whole file, so a passage from any session is accepted. When the report text is empty or absent, every entry SHALL be refused. `checkChallenges` SHALL refuse a log in which two entries in the same `## ` section of `decisions.md` carry the same `Challenge question:` value. The same question under a different `## ` heading, which is how a later session appends, is not a repeat, because the check cannot otherwise tell sessions apart.

#### Scenario: A passage that is not in the report is refused
- **GIVEN** an entry whose passage is not in the report, or any entry checked against an empty or absent report
- **WHEN** `checkChallenges` runs
- **THEN** it returns not ok and names the entry's challenge question in the problem, and the `check` mode exits 1

#### Scenario: A repeated question is refused only within a section
- **GIVEN** one log with two entries under the same `## ` heading that carry the same challenge question, and another with the same challenge question under two different `## ` headings
- **WHEN** `checkChallenges` runs on each
- **THEN** the first returns not ok naming the repeated question, and the second returns ok

### Requirement: Groom checks the log before it writes drafts, and the check fails closed
Step 8 of `skills/groom/SKILL.md` SHALL run `GROOM_DECISIONS_CHECK_INVOCATION` before the `groom-writer` is dispatched and before a valid source is copied. A non-zero exit SHALL stop the run until groom has corrected the current session's entries in `decisions.md` from the conversation and the check passes; groom SHALL NOT write drafts on a failing check. The Hard rules section of the skill SHALL name `groom-decisions.ts` in its closed list of local scripts the command's Bash may run, with `groom-paths.ts`, `verify-ticket.ts`, and `human-text.ts`. When `decisions.md` is missing or unreadable, the `check` mode SHALL exit 1 with a problem saying so. When the report file is absent, the `check` mode SHALL treat the report as empty.

#### Scenario: The skill runs the check before drafts and allows the script
- **GIVEN** the groom skill file
- **WHEN** the Hard rules and step 8 are read
- **THEN** the Hard rules list `groom-decisions.ts` among the scripts Bash may run, and step 8 contains the exact `GROOM_DECISIONS_CHECK_INVOCATION` before the writer dispatch and the copy of a valid source and says a non-zero exit stops the run until `decisions.md` is corrected

#### Scenario: A missing decision log fails closed
- **GIVEN** a path to a `decisions.md` that does not exist
- **WHEN** the `check` mode runs
- **THEN** it prints a problem saying the decision log could not be read and exits 1, and a missing report file with no entries still exits 0

### Requirement: Feasibility starts from groom's explorer report
`/groom` SHALL record the repository head under each explorer session it
saves. Before dispatching the feasibility analyst, `/draft` SHALL find the one
grooming report whose ticket draft has the work item's exact title and pass it
with whether it is stale and which files changed since its head. The analyst
SHALL re-explore those files. The explain-back reader and the readiness reviewer
SHALL NOT receive the report.

#### Scenario: A fresh report
- **WHEN** a matching report was written at the current head
- **THEN** feasibility receives it as a fresh starting map

#### Scenario: The repository changed since
- **WHEN** files changed after the report's recorded head
- **THEN** the report is marked stale, the changed files are listed, and the analyst re-explores them

#### Scenario: No single match
- **WHEN** no grooming draft, or more than one, has the work item's title
- **THEN** no report is used and feasibility explores from scratch

### Requirement: Explorer and feasibility read past decisions before code
The groom explorer and the feasibility analyst SHALL read the OpenSpec specs and
archived changes relevant to a ticket before reading code. The explorer's report
SHALL cite each one it relied on under Specs and decisions, and the feasibility
verdict SHALL list them in `specsRead`.

#### Scenario: A ticket on a capability with a spec
- **WHEN** a ticket touches a capability that has a spec under `openspec/specs/`
- **THEN** the explorer's report cites that spec by path

#### Scenario: Nothing recorded
- **WHEN** no spec or archived change bears on the ticket
- **THEN** the report says so and the verdict may leave `specsRead` out
