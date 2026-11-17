# groom Specification

## Purpose

This capability gives the operator a `/groom` command that takes raw input, whether an idea, an HLD, or a PRD, and produces small ticket drafts that can each be deployed alone and are ready for `/draft`. The command is interactive. It grounds itself in the target codebase, works out what shape the input has, and questions the operator one decision at a time, laying out the options and their trade-offs before it shows its own recommendation. It builds a PRD only when the input calls for one, and it writes ticket drafts, either a single ticket or a breakdown into vertical slices, only after approval and only inside `.delivery/grooming/`. Every acceptance criterion is a Given/When/Then behaviour statement, and nothing groom writes explains how the change will be built or tested. It has no MCP, git, or tracker side effects.

## Requirements

### Requirement: The operator runs an interactive command
The system SHALL offer a `/groom` command that the operator invokes and that runs interactively inside an agent session.

#### Scenario: The command runs as a conversation
- **WHEN** the operator invokes `/groom` in an agent session
- **THEN** the command starts and leads an interactive grooming session

### Requirement: Input is chosen in a fixed order
The command SHALL take a file path, inline text, or no argument. Given a file path, it SHALL read that file as the input. Given inline text, it SHALL use that text. Given no argument, it SHALL use the conversation so far. When there is no usable input anywhere, it MUST stop and ask for some instead of guessing or carrying on.

#### Scenario: A file path is given
- **WHEN** `/groom <path>` is invoked with a file path that can be read
- **THEN** the command takes that file as its input

#### Scenario: Inline text is given
- **WHEN** inline text is passed as in `/groom <text>`
- **THEN** the command takes that text as its input

#### Scenario: No argument uses the conversation
- **WHEN** `/groom` is invoked without an argument and the conversation holds usable context
- **THEN** the command takes the conversation context as its input

#### Scenario: Nothing usable means stopping to ask
- **WHEN** `/groom` is invoked without an argument and there is no usable input anywhere
- **THEN** the command stops and asks for input instead of carrying on

### Requirement: The codebase is read before any question
Before the grilling loop starts, the command SHALL explore the codebase without changing it, and its questions and slice proposals SHALL name real modules or domain terms found in the repository. When the resolved input already passes `verify-ticket.ts`, the command SHALL skip both exploration and grilling. When the input fails only because it lacks Out of scope or Blocked by, the command SHALL append each missing section as `None.` and SHALL skip exploration and grilling in the same way.

#### Scenario: Exploration comes first and is cited
- **WHEN** grooming starts on input that fails `verify-ticket.ts`
- **THEN** a read-only exploration of the codebase runs before the first grilling question
- **AND** the command's questions and slice proposals name real modules or domain terms from the repository

#### Scenario: A valid ticket skips exploration and grilling
- **WHEN** the resolved input passes `verify-ticket.ts`
- **THEN** the explorer is not dispatched
- **AND** the grilling loop does not run

#### Scenario: Missing housekeeping sections become none
- **WHEN** the input would be a valid ticket except that Out of scope or Blocked by is missing
- **THEN** each missing section is appended as `None.`
- **AND** exploration and grilling are skipped

### Requirement: Grilling asks one question at a time and holds back the recommendation
The grilling loop SHALL ask the operator only about decisions the operator owns. Facts, choices with a single viable path, and local defaults that are cheap to reverse SHALL be decided by the command itself, recorded as agent-owned, and passed over. Whenever it does ask, it SHALL ask exactly one question in that turn. A question with two or more viable options SHALL lay those options out with their context, benefits, and drawbacks, and SHALL NOT give a recommended answer in the same turn. Once the operator has chosen, the command SHALL reveal the recommendation it held back and SHALL offer to change the choice. It SHALL never put two or more questions in one turn.

#### Scenario: Simple decisions are not put to the operator
- **WHEN** the codebase, the input, or a cheap reversible default settles a gap
- **THEN** the command settles it, records it as agent-owned, and does not ask the operator

#### Scenario: Each turn holds one question
- **WHEN** the grilling loop is running
- **THEN** every turn asks exactly one question
- **AND** no turn asks two or more

#### Scenario: The options are shown before the recommendation
- **WHEN** a grilling question has two or more viable options
- **THEN** the first turn names the options with their context, benefits, and drawbacks, and gives no recommended answer
- **AND** after the operator chooses, the following turn reveals the held-back recommendation and offers to change the choice

### Requirement: Settled choices are written to a decision log
Each time a grilling choice is settled, the command SHALL append it to `decisions.md` in the grooming output directory, recording the question, the options, the operator's choice, the recommendation that was held back, and whether the two differ. Each time it makes an agent-owned decision, it SHALL append `Agent decided:` followed by one line saying why. `decisions.md` is a log of the run rather than a ticket draft, and it MAY be written before the operator approves the ticket plan.

#### Scenario: A settled question is logged
- **WHEN** the operator settles a grilling question
- **THEN** `decisions.md` in the grooming output directory records the question, the options, the operator's choice, and the recommendation revealed afterwards

#### Scenario: An agent-owned decision is logged without a question
- **WHEN** the command makes a simple decision by itself
- **THEN** `decisions.md` records `Agent decided:` and the reason
- **AND** the operator is not asked

### Requirement: Rawer input is questioned more
How deeply the command questions SHALL depend on how raw the input is: thin or raw input SHALL lead to more questions than an already detailed PRD of the same scope.

#### Scenario: A thin input draws more questions than a detailed PRD
- **WHEN** an input that is thin or raw is groomed
- **AND** an already detailed PRD covering the same scope is groomed
- **THEN** the thin input draws more grilling questions than the detailed PRD

### Requirement: The input's shape is decided before grilling
Before the grilling loop starts, the command SHALL decide whether the input is a single ticket, an initiative large enough to need a PRD and slices, or an ask that should become several tickets. When the evidence allows only one of these, the command SHALL settle on it, record it as agent-owned, and carry on without waiting for confirmation. When two or more remain possible, it SHALL use the human decision brief, showing the options first and its recommendation only after the operator chooses. Whether a PRD is built and whether the work is broken into vertical slices SHALL depend on the settled shape and SHALL NOT be the default route.

#### Scenario: The shape is decided before the first question
- **WHEN** grooming starts on an input
- **THEN** before the first grilling question, the command decides whether the input is a single ticket, an initiative that needs a PRD, or an ask that should be split
- **AND** says which it decided

#### Scenario: A clear shape is not put up for confirmation
- **WHEN** the evidence allows only one shape
- **THEN** the command settles on it as agent-owned and carries on without asking for confirmation

#### Scenario: A small single ask becomes one ticket with no PRD or slicing
- **WHEN** the input groomed is one small ask
- **THEN** the command settles on a single ticket
- **AND** builds no PRD and no vertical-slice breakdown

#### Scenario: A broad or multi-story input becomes a PRD, a split, or both
- **WHEN** a broad input, or one with several stories, is groomed
- **THEN** the command settles on a PRD, a split into several tickets, or both, before the grilling loop goes on
- **AND** does not go straight to the slice breakdown by default

### Requirement: A PRD is built only when the shape calls for it
When the settled shape is an initiative that needs a PRD, the command SHALL write a `prd.md` with sections for the problem, the solution, user stories, success criteria, constraints or NFRs, and what is out of scope, and SHALL offer it for review before it proposes any slices. The `prd.md` SHALL have no `Implementation decisions` section and no `Test seams` section. When the settled shape is a single ticket, or the input is trivial and no PRD is built, the command SHALL say that it skipped the PRD.

#### Scenario: A PRD is written and offered for review
- **WHEN** the settled shape is an initiative that needs a PRD
- **THEN** the command writes a `prd.md` with sections for the problem, the solution, user stories, success criteria, constraints or NFRs, and what is out of scope
- **AND** the `prd.md` has no `Implementation decisions` section and no `Test seams` section
- **AND** the command offers it for review before proposing slices

#### Scenario: A single ticket or trivial input says the PRD was skipped
- **WHEN** the settled shape is a single ticket, or the input is trivial and no PRD is built
- **THEN** the command says it skipped the PRD

### Requirement: Drafts wait for approval of the ticket or the slices
When the settled shape is an initiative that needs a PRD or an ask that should be split, the command SHALL show the planned work as a numbered list of vertical slices, each giving its title, the slices it is blocked by, and the user stories it covers. When the settled shape is a single ticket, the command SHALL show that one ticket for approval directly instead of a numbered breakdown. Either way, the command SHALL NOT write any draft file before the operator explicitly approves.

#### Scenario: A slice breakdown is put up for approval
- **WHEN** the settled shape is an initiative that needs a PRD or an ask that should be split
- **THEN** the command shows a numbered list of vertical slices, each giving its title, the slices it is blocked by, and the stories it covers

#### Scenario: A single ticket is put up for approval directly
- **WHEN** the settled shape is a single ticket
- **THEN** the command shows that one ticket for approval directly instead of a numbered slice breakdown

#### Scenario: Nothing is written before approval
- **WHEN** neither the ticket nor the slice breakdown has the operator's approval yet
- **THEN** no draft file has been written

### Requirement: Each ticket fits one small context
Every ticket SHALL be one useful vertical outcome that a person can understand, test, build, verify, and review in one fresh small-context session. It SHALL hold one user story, one primary public contract or behaviour, one cohesive code area with its tests, and one to three acceptance criteria. Outcomes that stand alone, separate behaviour clusters, additional consumers, and unrelated subsystems SHALL go into tickets of their own. Each ticket produced by a split SHALL stay vertically complete, and a split SHALL NOT fall back on frontend-only, backend-only, test-only, or speculative foundation microtickets.

#### Scenario: A broad slice is split before it is approved
- **WHEN** a proposed slice holds outcomes that could each be deployed alone, or has more than three acceptance criteria
- **THEN** groom proposes smaller vertical tickets instead
- **AND** does not offer the broad slice as ready for approval

#### Scenario: Every piece of a split is complete
- **WHEN** groom splits a broad outcome
- **THEN** each resulting ticket leaves one useful behaviour or public contract working
- **AND** no resulting ticket is only a technical layer that some later, unstated ticket needs

### Requirement: Groom output says what, never how
No part of any groom output, whether a `prd.md` or a ticket draft, SHALL explain how the change is built or tested. Groom output SHALL have no `Implementation decisions` section and no `Test seams` section. The grilling loop SHALL NOT ask the operator about test seams or implementation decisions, and SHALL ask what-level questions about success criteria and constraints or NFRs in their place.

#### Scenario: The output has no implementation or test sections
- **WHEN** any groom output is examined
- **THEN** it has no `Implementation decisions` section and no `Test seams` section
- **AND** no prose in it explains how the change is built or tested

#### Scenario: The grilling loop asks only what-level questions
- **WHEN** the grilling loop is running
- **THEN** it asks the operator nothing about test seams or implementation decisions
- **AND** the questions it asks in their place are what-level, about success criteria or constraints and NFRs

### Requirement: Ticket drafts follow the template
Every ticket draft written SHALL have each required template section (Context, User stories, What to build, Acceptance criteria, Out of scope, Blocked by), one clear deliverable, no more than one user story, from one to three acceptance criteria, and every acceptance criterion written as a Given/When/Then behaviour statement.

#### Scenario: A draft has every section and Given/When/Then criteria
- **WHEN** a ticket draft is written
- **THEN** it has the Context, User stories, What to build, Acceptance criteria, Out of scope, and Blocked by sections
- **AND** it describes one clear deliverable
- **AND** every acceptance criterion is a Given/When/Then behaviour statement

#### Scenario: A draft has no more than one user story
- **WHEN** a ticket draft is written
- **THEN** its User stories section holds no more than one user story

#### Scenario: A draft has no more than three acceptance criteria
- **WHEN** a ticket draft is written
- **THEN** its Acceptance criteria section holds from one to three criteria

### Requirement: A draft's structure is verified and failures stop it
`scripts/verify-ticket.ts` SHALL reject a draft that lacks a required section, that has no acceptance criteria or more than three, whose User stories section holds more than one user story, or in which any acceptance criterion is not a Given/When/Then behaviour statement, and SHALL warn when a slice is larger than the size heuristic allows. It SHALL print structured JSON, SHALL exit non-zero on failure, and SHALL be covered by `bun test`. A draft that fails verification SHALL be corrected and written again, and SHALL never become the final artifact.

#### Scenario: A missing section is rejected
- **WHEN** `verify-ticket.ts` checks a draft that lacks a required section
- **THEN** it reports a failure, prints structured JSON, and exits non-zero

#### Scenario: No acceptance criteria is rejected
- **WHEN** `verify-ticket.ts` checks a draft with no acceptance criteria
- **THEN** it reports a failure, prints structured JSON, and exits non-zero

#### Scenario: More than three acceptance criteria is rejected
- **WHEN** `verify-ticket.ts` checks a draft with more than three acceptance criteria
- **THEN** it reports a failure, advises splitting the behaviour clusters, and exits non-zero

#### Scenario: A second user story is rejected
- **WHEN** `verify-ticket.ts` checks a draft whose User stories section holds more than one user story
- **THEN** it reports a failure, prints structured JSON, and exits non-zero

#### Scenario: A criterion that is not Given/When/Then is rejected
- **WHEN** `verify-ticket.ts` checks a draft in which some acceptance criterion is not a Given/When/Then behaviour statement
- **THEN** it reports a failure, prints structured JSON, and exits non-zero

#### Scenario: An oversized slice draws a warning
- **WHEN** `verify-ticket.ts` checks a draft whose slice is larger than the size heuristic allows
- **THEN** it prints a warning and still reports whether the draft passed or failed

#### Scenario: A failing draft never becomes final
- **WHEN** `verify-ticket.ts` fails a draft
- **THEN** it is corrected and written again
- **AND** it never becomes the final artifact

#### Scenario: Valid input approved as it stands is copied without the writer
- **WHEN** the input passed `verify-ticket.ts` and the operator approved it as it stands, with no rewrite
- **THEN** the final draft is a verified copy of that source
- **AND** the groom-writer is not dispatched

### Requirement: Output paths are deterministic
`scripts/groom-paths.ts` SHALL turn the input title into a slug so that a given title always leads to the same output path under `.delivery/grooming/<slug>/`, and SHALL be covered by `bun test`.

#### Scenario: One title always gives one path
- **WHEN** `groom-paths.ts` derives the path for the same input title twice
- **THEN** both calls give back the same `.delivery/grooming/<slug>/` directory

### Requirement: Output stays in the grooming directory, which is ignored once
Every file groom generates SHALL be written under `.delivery/grooming/` and nowhere else. After a run, `.gitignore` SHALL list `.delivery/grooming/`, added in a way that a second run does not add it again.

#### Scenario: Every output file is under the grooming directory
- **WHEN** a grooming run writes a file
- **THEN** the file is under `.delivery/grooming/`

#### Scenario: The ignore entry is added only once
- **WHEN** a run finishes and `.gitignore` does not yet list `.delivery/grooming/`
- **THEN** the command adds the entry
- **AND** a second run does not add it again

### Requirement: No MCP, git, or tracker side effects
Neither the command nor any of its subagents SHALL have an MCP, git, or tracker tool in its allow-list. A run SHALL make no commit and cause no tracker activity.

#### Scenario: A run touches neither git nor the tracker
- **WHEN** `/groom` runs to the end
- **THEN** no commit is made
- **AND** nothing happens in the tracker
- **AND** neither the command nor its subagents hold an MCP, git, or tracker tool

### Requirement: Human-facing text is sanitized
Every piece of text the command shows a person SHALL go through `sanitizeHumanText` and SHALL contain no em dash or en dash.

#### Scenario: Text shown to a person is sanitized
- **WHEN** the command produces any text meant for a person
- **THEN** that text goes through `sanitizeHumanText`
- **AND** holds no em dash or en dash

### Requirement: Chaos tests hold groom to its guarantees
A chaos-style test SHALL assert that groom never writes a file outside `.delivery/grooming/`, never produces a draft with no acceptance criteria or more than three, and never produces a draft with an acceptance criterion that is not Given/When/Then.

#### Scenario: The chaos test checks each standing guarantee
- **WHEN** the chaos-style test is run
- **THEN** it asserts that no write ever lands outside `.delivery/grooming/`
- **AND** it asserts that no draft without acceptance criteria becomes a final artifact
- **AND** it asserts that no draft with more than three acceptance criteria becomes a final artifact
- **AND** it asserts that no draft with an acceptance criterion that is not Given/When/Then becomes a final artifact

### Requirement: The run ends with a summary and the next step
When it finishes, the command SHALL print the output directory path, the file names of the drafts it wrote, and the next step in plain terms: review the drafts, create the tickets in the tracker, then run `/draft` for each ticket.

#### Scenario: A finished run prints the paths and the next step
- **WHEN** a grooming run finishes successfully
- **THEN** the command prints the output directory path and the file names of the drafts
- **AND** prints the next step: review the drafts, create the tickets in the tracker, then run `/draft` for each ticket
