## Why

The correctness review sends a change through up to four lenses and then goes straight to adjudication. Nothing checks which changed files any lens actually looked at, so a changed file can pass through review without being examined and nobody can tell. An operator who reads a PASS cannot say that every changed file was read by at least one lens.

## What Changes

- Every review lens returns, with its candidates or with `NO FINDINGS`, a list of the files it examined. A file counts as examined only when the lens read its contents, meaning the file's changed lines in the pinned diff or the file at the head. A deleted file counts when the lens read its removed lines in the pinned diff. A file the lens only named does not count.
- After the lenses finish and before adjudication, a coverage check compares the changed files with the lenses' lists. The script works out the changed files itself from the base (or, in a delta review, the earlier reviewed head) and the head. The conversation never hands it a path list. A delta review also carries forward any file an earlier review left still unexamined
- The review brief's changed-path list is printed by the same code that the coverage check uses, so the strings the lenses are given are the strings the check matches. A renamed file is two changed files, the old path removed and the new path added, and a path with non-ASCII characters is written as it is, never quoted
- A changed binary file has no text to read. It is named in the artifact and the review output as a binary file, is not sent to a focused pass, and does not count as unexamined
- Every changed file that no lens reported examining is listed in `.review/mr-<iid>/<full-head-sha>/lens-coverage.json` and named in the review output
- Each unexamined file gets exactly one focused pass before adjudication: one read-only subagent for that file, on the standard model tier, that returns candidates in the lens candidate format. Those candidates are merged into the candidates adjudication reads
- The script, not the conversation, decides whether a focused pass examined its file: the pass is examined only when its own reported list holds its file path
- The script reads the earlier `lens-coverage.json` for the same head when the review resumes, keeps the recorded outcomes, and never asks for a second pass on a file that has one
- A focused pass that fails leaves its file recorded and named as still unexamined. Adjudication continues, and the pass is never repeated for that file in the same review
- When no lens ran, the coverage check does not run, and the artifact records that it was skipped and why
- A lens report with no examined-files list, or one that is malformed, stops the review. The check never guesses. Paths are compared exactly as written, with no trimming
- `review-fanout.ts` gains a `paths` subcommand that prints the changed files and a `coverage` subcommand that reads the lens reports, writes the artifact, and returns the files that still need a pass. The decision is a pure function next to `planAdjudication`

## Capabilities

### New Capabilities

- `review-lens-coverage`: the examined-files report each lens returns, how the script finds the changed files, the coverage check and its artifact, the single focused pass per unexamined file and who decides its outcome, resume and delta behaviour, binary and deleted files, the failure and skip behaviour, and the statement that coverage means reported examination

### Modified Capabilities

- `cost-efficient-routing`: gains one requirement that a focused coverage pass uses the standard model tier and that a review with no lens records the coverage skip without adding a second skipped-worker entry. The existing requirements are not changed

## Out of Scope

- Measuring coverage inside a file
- Adding new review lenses
- Repeating the focused pass more than once per file
- Proving that a lens read a file it says it read: the check relies on the lens's own report
- Changing how `measure` counts or names paths, or how a review chooses its lenses. The coverage check finds its own paths and `measure` is left as it is
- Making a still-unexamined file change the review verdict by itself
- Changing `review-scope.ts` so that a file an earlier review left unexamined stops counting as covered. The coverage check carries such files forward instead, which fixes the gap for this check without changing how a review picks its scope
- Treating a rename as one file with rename detection. A rename is read as a removal and an addition because that is the only form whose path strings can be matched exactly
- Reading the contents of a binary file, or a focused pass for one
- Recovering a focused pass that was started but never returned an outcome before a crash. It has no recorded outcome, so it counts as not run

## Impact

- `factory/scripts/review-fanout.ts` gains `planCoverage`, a function that lists the changed files from git output, their input and result schemas, and the `paths` and `coverage` subcommands. `LensCandidates`, `planAdjudication` and `measureReviewableDiff` are not changed
- `skills/code-review-max/SKILL.md` builds the brief's changed-path list from `paths`, gains the examined-files line in the lens report, a step between Parallel review and Adjudicate, a Coverage section in the output, and a line in Never
- `factory/scripts/review-fanout.test.ts` covers the planner and the command line against a real temporary git repository
- `skills/delivery/checks/delivery-specs.test.ts` and `factory/scripts/workflow-contracts.test.ts` assert the new wording and the one-line invocation while keeping every existing contract string
- `docs/reference.md`, `docs/workflow.md`, `README.md`, `factory/CONVENTIONS.md` and `openspec/specs/cost-efficient-routing/spec.md` describe the check in their review sections
- A new persisted artifact, `lens-coverage.json`, joins the per-head review folder, and a new input file, `lens-coverage-input.json`, is written beside it
