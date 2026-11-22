## ADDED Requirements

### Requirement: Provider commands describe their own inputs

`forge-provider.ts`, `work-item-provider.ts`, `review-fanout.ts`, and
`forge-comments.ts` SHALL print every operation's input shape with `--help`,
derived from the schema the command validates against, and exit zero. The
runtime notes SHALL tell a session never to read a script's source to learn
how to call it.

#### Scenario: Help for one operation

- **WHEN** `forge-provider.ts --help note` runs
- **THEN** it prints the note input's fields, marking optional ones, and exits zero

### Requirement: Runtime notes load rarely needed detail on demand

`RUNTIME.md` SHALL keep runtime resolution, dispatch, provider, and model
inventory rules, and SHALL point to `reference/model-evaluation.md` and
`reference/review-fanout.md` with the condition under which each is read.

#### Scenario: A stage without review lenses

- **WHEN** a stage that fans out no review lenses loads the runtime notes
- **THEN** it does not need to read the review fan-out reference

### Requirement: A run reuses a recent host-tool inventory

`mcp-inventory.ts fresh` SHALL exit zero only when the recorded inventory
parses, is not empty, is not dated in the future, and is younger than the
maximum age. A run SHALL reuse such an inventory instead of listing the host's
tools, and SHALL record it again when a planned tool is missing or
unauthenticated.

#### Scenario: Old inventory

- **WHEN** the inventory was recorded more than 12 hours ago
- **THEN** `fresh` exits non-zero with the reason, and the run records the tools again

### Requirement: Long commands keep their output in files

`quiet-run.ts` SHALL run a command without a shell, keep its whole output in a
log file, exit with the command's code, and print only the lines that name a
failure and the end of the run.

#### Scenario: Failing typecheck

- **WHEN** a typecheck run through `quiet-run.ts` fails among hundreds of lines
- **THEN** the printed excerpt holds the error lines and the last lines, and the log holds everything
