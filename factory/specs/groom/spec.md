# groom Specification

## Purpose

The `groom` capability provides an operator-invoked `/groom` command that turns raw input (an idea, an HLD, or a PRD) into small, individually deployable ticket drafts ready for `/draft`. It runs interactively, grounds itself in the target codebase, classifies the input shape and recommends it to the operator, grills the operator one question at a time, conditionally synthesizes a PRD, and emits approval-gated ticket drafts (a single ticket, or a vertical-slice breakdown) confined to `.delivery/grooming/`. Every acceptance criterion is a Given/When/Then behaviour statement, and no groom output describes how the change is built or tested. It performs no MCP, git, or Jira side effects.

## Requirements

### Requirement: Command is registered and interactive
The system SHALL provide an operator-invoked `/groom` command that runs interactively inside a Claude Code session.

#### Scenario: Command runs interactively
- **WHEN** an operator invokes `/groom` in a Claude Code session
- **THEN** the command starts and drives an interactive grooming session

### Requirement: Resolve input by precedence
The command SHALL accept a file path argument, inline text, or no argument. With a file path it SHALL read that file as input; with inline text it SHALL use the text; with no argument it SHALL use the conversation context. With no usable input at all it MUST stop and ask rather than guessing or proceeding.

#### Scenario: File path argument
- **WHEN** `/groom <path>` is invoked with a readable file path
- **THEN** the command reads that file as its input

#### Scenario: Inline text argument
- **WHEN** `/groom <text>` is invoked with inline text
- **THEN** the command uses that text as its input

#### Scenario: No argument falls back to conversation context
- **WHEN** `/groom` is invoked with no argument and the conversation contains usable context
- **THEN** the command uses the conversation context as its input

#### Scenario: No usable input stops and asks
- **WHEN** `/groom` is invoked with no argument and no usable input anywhere
- **THEN** the command stops and asks for input rather than proceeding

### Requirement: Read-only codebase grounding before grilling
Before the grilling loop begins, the command SHALL perform a read-only codebase exploration and SHALL reference concrete module names or domain terms found in the repository in its questions and slice proposals.

#### Scenario: Grounding precedes grilling and is cited
- **WHEN** grooming begins for a given input
- **THEN** a read-only codebase exploration runs before any grilling question
- **AND** the command's questions and slice proposals reference concrete modules or domain terms from the repository

### Requirement: One-question-at-a-time grilling with recommendations
The grilling loop SHALL emit exactly one question per turn, and every question SHALL include a recommended answer. It SHALL never batch two or more questions into a single turn.

#### Scenario: Exactly one question per turn
- **WHEN** the grilling loop is active
- **THEN** each turn presents exactly one question with a recommended answer
- **AND** no turn contains two or more questions

### Requirement: Grilling depth scales to input maturity
The grilling depth SHALL scale to how raw the input is: a thin or raw input SHALL produce more questions than an already-detailed PRD of equivalent scope.

#### Scenario: Thin input is grilled harder than a detailed PRD
- **WHEN** a thin or raw input is groomed
- **AND** an already-detailed PRD of equivalent scope is groomed
- **THEN** the thin input produces more grilling questions than the detailed PRD

### Requirement: Input-shape classification before grilling
Before the grilling loop begins, the command SHALL classify the input shape as one of: a single ticket, a PRD-worthy initiative that needs slices, or an ask that should be split into multiple tickets. It SHALL present that classification to the operator as a recommendation (for example, "this reads as two tickets") before grilling continues. PRD synthesis and the vertical-slice breakdown SHALL be conditional on this recommendation rather than a default path.

#### Scenario: Classification precedes grilling
- **WHEN** grooming begins for a given input
- **THEN** the command classifies the input as a single ticket, a PRD-worthy initiative, or a split-worthy ask before the first grilling question
- **AND** presents that classification to the operator as a recommendation

#### Scenario: Single small ask recommends one ticket and skips PRD and slicing
- **WHEN** a single small ask is groomed
- **THEN** the command recommends a single ticket
- **AND** skips PRD synthesis and the vertical-slice breakdown

#### Scenario: Broad or multi-story input recommends a PRD and/or split
- **WHEN** a broad or multi-story input is groomed
- **THEN** the command recommends a PRD and/or a split into multiple tickets before the grilling loop continues
- **AND** does not default straight to the slice-breakdown path

### Requirement: Conditional PRD synthesis
When the input-shape classification recommends a PRD-worthy initiative, the command SHALL write a `prd.md` file containing problem, solution, user stories, success criteria, constraints or NFRs, and out-of-scope sections, and SHALL offer it for review before proposing slices. The `prd.md` SHALL contain no `Implementation decisions` section and no `Test seams` section. When the classification recommends a single ticket or the input is trivial and no PRD is built, the command SHALL state that it skipped the PRD.

#### Scenario: PRD is built and offered for review
- **WHEN** the input-shape classification recommends a PRD-worthy initiative
- **THEN** the command writes `prd.md` containing problem, solution, user stories, success criteria, constraints or NFRs, and out-of-scope sections
- **AND** the `prd.md` contains no `Implementation decisions` or `Test seams` section
- **AND** offers it for review before proposing slices

#### Scenario: Single-ticket or trivial input skips the PRD explicitly
- **WHEN** the classification recommends a single ticket, or the input is trivial and no PRD is built
- **THEN** the command states that it skipped the PRD

### Requirement: Approval-gated ticket or vertical-slice breakdown
When the input-shape classification recommends a PRD-worthy initiative or a split-worthy ask, the command SHALL present the proposed work as a numbered list of vertical slices, each entry showing title, blocked-by dependencies, and the user stories it covers. When the classification recommends a single ticket, the command SHALL present that one ticket directly for approval instead of a numbered breakdown. In either case the command SHALL NOT write any draft file until the operator explicitly approves.

#### Scenario: Breakdown is presented for approval
- **WHEN** the classification recommends a PRD-worthy initiative or a split-worthy ask
- **THEN** the command presents a numbered list of vertical slices, each showing title, blocked-by dependencies, and the stories it covers

#### Scenario: Single ticket is presented directly for approval
- **WHEN** the classification recommends a single ticket
- **THEN** the command presents that one ticket directly for approval instead of a numbered slice breakdown

#### Scenario: No draft is written before approval
- **WHEN** the operator has not yet approved the ticket or the slice breakdown
- **THEN** no draft file is written

### Requirement: Atomic tickets fit a small context
Every ticket SHALL be one useful vertical outcome that can be understood,
tested, implemented, verified, and reviewed in one fresh small-context session.
It SHALL contain one user story, one primary public contract or behaviour, one
cohesive code area plus tests, and one to three acceptance criteria. Independent
outcomes, behaviour clusters, consumers, or unrelated subsystems SHALL be split
into separate tickets. A split SHALL remain vertically complete and SHALL NOT
default to frontend-only, backend-only, test-only, or speculative foundation
microtickets.

#### Scenario: A broad slice is split before approval
- **WHEN** a proposed slice contains independently deployable outcomes or more than three acceptance criteria
- **THEN** groom recommends smaller vertical tickets
- **AND** does not present the broad slice as approval-ready

#### Scenario: A split remains complete
- **WHEN** groom splits a broad outcome
- **THEN** each resulting ticket leaves one useful behaviour or public contract working
- **AND** no resulting ticket is merely a technical layer required by an unspecified later ticket

### Requirement: Groom output describes what, not how
No section of any groom output (a `prd.md` or a ticket draft) SHALL describe how the change is implemented or tested. Groom output SHALL contain no `Implementation decisions` section and no `Test seams` section. The grilling loop SHALL NOT ask the operator about test seams or implementation decisions; any such questions SHALL be replaced with what-level questions (success criteria, constraints or NFRs).

#### Scenario: No implementation or test sections in output
- **WHEN** any groom output is inspected
- **THEN** it contains no `Implementation decisions` section and no `Test seams` section
- **AND** it contains no prose describing how the change is implemented or tested

#### Scenario: Grilling asks only what-level questions
- **WHEN** the grilling loop is active
- **THEN** it does not ask the operator about test seams or implementation decisions
- **AND** any replacement questions are what-level (success criteria, constraints or NFRs)

### Requirement: Ticket drafts conform to the template
Each emitted ticket draft SHALL contain all required template sections (Context, User stories, What to build, Acceptance criteria, Out of scope, Blocked by), a single clear deliverable, at most one user story, between one and three acceptance criteria, and acceptance criteria each phrased as a Given/When/Then behaviour statement.

#### Scenario: Draft has all sections and Given/When/Then criteria
- **WHEN** a ticket draft is emitted
- **THEN** it contains Context, User stories, What to build, Acceptance criteria, Out of scope, and Blocked by sections
- **AND** it describes a single clear deliverable
- **AND** each acceptance criterion is a Given/When/Then behaviour statement

#### Scenario: Draft carries at most one user story
- **WHEN** a ticket draft is emitted
- **THEN** its User stories section contains at most one user story (never more than one)

#### Scenario: Draft carries at most three acceptance criteria
- **WHEN** a ticket draft is emitted
- **THEN** its Acceptance criteria section contains between one and three criteria

### Requirement: Structural ticket-draft verification (fail closed)
`scripts/verify-ticket.ts` SHALL reject a draft missing any required section, SHALL reject a draft with zero or more than three acceptance criteria, SHALL reject a draft whose User stories section contains more than one user story, SHALL reject a draft in which any acceptance criterion is not a Given/When/Then behaviour statement, and SHALL warn when a slice exceeds the size heuristic. It SHALL emit structured JSON and exit non-zero on failure, and it SHALL be exercised by `bun test`. A draft that fails verification SHALL be fixed and re-emitted, and SHALL never be written as the final artifact.

#### Scenario: Missing section is rejected
- **WHEN** `verify-ticket.ts` checks a draft missing any required section
- **THEN** it reports failure, emits structured JSON, and exits non-zero

#### Scenario: Zero acceptance criteria is rejected
- **WHEN** `verify-ticket.ts` checks a draft with zero acceptance criteria
- **THEN** it reports failure, emits structured JSON, and exits non-zero

#### Scenario: More than three acceptance criteria is rejected
- **WHEN** `verify-ticket.ts` checks a draft with more than three acceptance criteria
- **THEN** it reports failure, recommends splitting behaviour clusters, and exits non-zero

#### Scenario: More than one user story is rejected
- **WHEN** `verify-ticket.ts` checks a draft whose User stories section contains more than one user story
- **THEN** it reports failure, emits structured JSON, and exits non-zero

#### Scenario: Non-Given/When/Then acceptance criterion is rejected
- **WHEN** `verify-ticket.ts` checks a draft in which any acceptance criterion is not a Given/When/Then behaviour statement
- **THEN** it reports failure, emits structured JSON, and exits non-zero

#### Scenario: Oversized slice warns
- **WHEN** `verify-ticket.ts` checks a draft whose slice exceeds the size heuristic
- **THEN** it emits a warning while still reporting its pass/fail result

#### Scenario: A failing draft is never written as final
- **WHEN** a draft fails `verify-ticket.ts`
- **THEN** it is fixed and re-emitted
- **AND** it is never written as the final artifact

### Requirement: Deterministic output paths
`scripts/groom-paths.ts` SHALL derive a slug from the input title such that the same title always yields the same output path under `.delivery/grooming/<slug>/`, and it SHALL be exercised by `bun test`.

#### Scenario: Same title yields the same path
- **WHEN** `groom-paths.ts` derives a path for a given input title twice
- **THEN** both calls return the same `.delivery/grooming/<slug>/` directory

### Requirement: Output confined to the grooming directory with idempotent gitignore
All generated files SHALL be written only under `.delivery/grooming/`. After a run, `.delivery/grooming/` SHALL be present in `.gitignore`, added idempotently so a second run does not duplicate the entry.

#### Scenario: All output lands under the grooming directory
- **WHEN** a grooming run writes any file
- **THEN** that file is located under `.delivery/grooming/`

#### Scenario: Gitignore entry is added once
- **WHEN** a run completes and `.delivery/grooming/` is not yet in `.gitignore`
- **THEN** the entry is added
- **AND** a second run does not duplicate the entry

### Requirement: No MCP, git, or Jira side effects
The command and all its subagents SHALL have no MCP, git, or Jira tools in their allow-lists. A run SHALL produce no commits and no Jira activity.

#### Scenario: No git or Jira activity on a run
- **WHEN** `/groom` runs to completion
- **THEN** no commits are made
- **AND** no Jira activity occurs
- **AND** neither the command nor its subagents hold any MCP, git, or Jira tools

### Requirement: Sanitized human-facing output
All human-facing output produced by the command SHALL pass through `sanitizeHumanText` and SHALL contain no em dashes or en dashes.

#### Scenario: Output is sanitized
- **WHEN** the command emits any human-facing text
- **THEN** that text passes through `sanitizeHumanText`
- **AND** contains no em dashes or en dashes

### Requirement: Chaos guarantees for groom
A chaos-style test SHALL assert that groom never writes files outside `.delivery/grooming/`, never emits a draft with zero or more than three acceptance criteria, and never emits a draft with a non-Given/When/Then acceptance criterion.

#### Scenario: Chaos test asserts the standing guarantees
- **WHEN** the chaos test runs
- **THEN** it asserts no write ever lands outside `.delivery/grooming/`
- **AND** it asserts no draft with zero acceptance criteria is emitted as a final artifact
- **AND** it asserts no draft with more than three acceptance criteria is emitted as a final artifact
- **AND** it asserts no draft with a non-Given/When/Then acceptance criterion is emitted as a final artifact

### Requirement: Closing summary and handoff
On completion the command SHALL print the output directory path, the list of draft filenames written, and the explicit next step: review the drafts, create the tickets in Jira, then run `/draft` per ticket.

#### Scenario: Completion prints paths and next step
- **WHEN** a grooming run completes successfully
- **THEN** the command prints the output directory path and the list of draft filenames
- **AND** prints the next step: review the drafts, create the tickets in Jira, then run `/draft` per ticket
