## ADDED Requirements

### Requirement: Groom and draft descriptions name what starts them and what must not
The `description` in the frontmatter of `skills/groom/SKILL.md` and of `skills/draft/SKILL.md` SHALL state what the skill does, then a sentence starting `Use when` that says what starts it, then a sentence starting `Not for` that says what must not start it. Each `Not for` sentence SHALL contain the words `a question about what a ticket means`. Neither description SHALL contain an em dash or an en dash in these two sentences.

#### Scenario: Both descriptions carry a start clause and a not-for clause
- **GIVEN** the frontmatter descriptions of `skills/groom/SKILL.md` and `skills/draft/SKILL.md`
- **WHEN** each description is read
- **THEN** each has a sentence starting `Use when` and a sentence starting `Not for` that contains `a question about what a ticket means`, and the whole-pack metadata test reports no issue for either file

### Requirement: Loading a stage skill never authorises its workflow
`skills/groom/SKILL.md` and `skills/draft/SKILL.md` SHALL each have a step 0 placed before every step that fetches, derives a path, writes, or dispatches a worker. Step 0 SHALL state `Loading this skill does not authorise a run.` Step 0 applies only when the skill was loaded without being named. A request is a named invocation, and step 0 SHALL continue at step 1 without asking anything, when any of these holds: the operator typed the slash command (`/groom` or `/draft`), with or without an argument; the delivery conductor dispatched the stage, because the dispatch names the stage command; or a run contract file `.delivery/runs/<id>.run-contract.json` already exists for the run. Step 1's own question for missing input in groom SHALL be unchanged. Every other request is ambiguous. For an ambiguous request, step 0 SHALL ask `exactly one question` (whether the operator wants a full run or only an answer) and SHALL write nothing tracked, post nothing, and dispatch no worker until it is answered. A clear yes SHALL continue at step 1. Any other reply, including silence, SHALL end the run after answering the original question, SHALL NOT lead to a second clarifying question, and SHALL post nothing and write nothing tracked. In groom the answer writes nothing. In draft the answer MAY use step 1's read-only fetch of the work item through the normal fetch command, and MAY save the result under `<reviewDir>` only when that folder is already ignored by the repository. It SHALL NOT edit `.gitignore`, read a provider file, call a remote provider directly, or post a note.

The tests locate step 0 and the first write by these anchors. In `skills/groom/SKILL.md`, step 0 is the heading `### Step 0: Confirm this is a run`, it must come before the heading `### Step 1`, and the first write is at the heading `### Step 2a`. In `skills/draft/SKILL.md`, step 0 is the line `0. **Confirm this is a run.**`, and the first write is at the line `1. **Fetch the work item.**`. Step 0 must come before each file's first-write anchor.

#### Scenario: An unnamed request asks one question before anything is written
- **GIVEN** the text of `skills/groom/SKILL.md` and of `skills/draft/SKILL.md`
- **WHEN** each file is read for step 0 by its anchor
- **THEN** step 0 exists at its anchor before the first-write anchor, contains `does not authorise a run` and `exactly one question`, and says nothing tracked is written, nothing is posted, and no worker is dispatched before the answer

#### Scenario: A named invocation never asks the extra question
- **GIVEN** the step 0 text in each skill
- **WHEN** it is read for the named-invocation rule
- **THEN** it says the slash command with or without an argument, a conductor dispatch, and an existing run contract file each continue at step 1 without a question, and the groom step 1 text that stops and asks when there is no usable input is still present unchanged

#### Scenario: A reply that is not a clear yes ends with a plain answer
- **GIVEN** the step 0 text in each skill
- **WHEN** it is read for the outcome of an unclear or negative reply
- **THEN** it says the skill answers the original question and ends, asks no second question, and writes nothing tracked and posts nothing; the groom text says the answer writes nothing, and the draft text says the answer may use step 1's fetch, saves only into an already ignored `<reviewDir>`, and does not edit `.gitignore`, read a provider file, call a provider directly, or post a note

### Requirement: The skill metadata check requires a not-for clause on covered stage skills
`factory/scripts/skill-metadata.ts` SHALL export `NOT_FOR_STAGE_SKILLS` with the values `groom` and `draft`, `parseSkillName(text)` and `parseSkillDescription(text)` returning the frontmatter value or `null`, `hasNotForClause(description)`, and `coveredSkillIssues(skillNames)`. Both parsers SHALL read the value the same way: the text after the key on its line plus any following indented lines joined by single spaces, a value that is only a block scalar marker (`>`, `>-`, `|`, or `|-`) taking its text from the indented lines under it, surrounding whitespace removed, and one pair of matching surrounding single or double quotes removed. A description has a not-for clause when it contains a sentence that starts with `Not for` (case sensitive), a space, and at least one more non-space character, where a sentence starts at the beginning of the description or after `.`, `?`, or `!` and whitespace. `skillMetadataIssues` SHALL add the issue `<relativePath>: stage skill '<name>' description has no not-for clause` for a skill whose parsed name is in `NOT_FOR_STAGE_SKILLS` and whose description has no not-for clause, including when the description is missing or empty. It SHALL NOT add that issue for any other skill, and SHALL leave every existing issue unchanged. `coveredSkillIssues` SHALL return, for each entry of `NOT_FOR_STAGE_SKILLS` that is not among the given names, the issue `stage skill '<name>' in NOT_FOR_STAGE_SKILLS matches no skill in the pack`. The whole-pack test in `factory/scripts/skill-metadata.test.ts` SHALL pass the parsed name of every real `SKILL.md` to `coveredSkillIssues` and require no issue.

#### Scenario: A covered skill with no not-for clause fails and is named
- **GIVEN** skill text whose parsed name is `draft` or `groom` and whose description has no not-for clause
- **WHEN** `skillMetadataIssues` runs on it
- **THEN** the issues include `<relativePath>: stage skill '<name>' description has no not-for clause` with the real path and the skill name

#### Scenario: A covered skill with a not-for clause passes
- **GIVEN** skill text whose name is `groom`, once plain and once written as `"groom"` with quotes, and whose description contains `Not for a question about what a ticket means.` once on one line and once as a block scalar over indented lines
- **WHEN** `skillMetadataIssues` runs on each
- **THEN** it reports no not-for issue, and the quoted name is still recognised as covered

#### Scenario: A malformed or missing clause fails closed
- **GIVEN** covered skill text whose description has `not for` in lower case, `Do not use for` in place of the clause, `Not for` with nothing after it, `Not for` only in the middle of a sentence, an empty description, or no description key
- **WHEN** `skillMetadataIssues` runs on each
- **THEN** each reports the not-for issue for that skill

#### Scenario: Skills outside the covered list are not flagged
- **GIVEN** skill text whose name is `execute` or `address-comments` with a description that has no not-for clause
- **WHEN** `skillMetadataIssues` runs on it
- **THEN** it reports no not-for issue, and `NOT_FOR_STAGE_SKILLS` equals exactly `groom` and `draft`

#### Scenario: A covered name that matches no skill in the pack is reported
- **GIVEN** the names of the real skills with `draft` replaced by `drafting`, and separately the real names unchanged
- **WHEN** `coveredSkillIssues` runs on each list
- **THEN** the first list reports `stage skill 'draft' in NOT_FOR_STAGE_SKILLS matches no skill in the pack`, and the real names report no issue
