# review-lens-coverage Specification

## Purpose
Check that every changed file was read by at least one review lens, give each unread file one focused pass before adjudication, and record and name any file that still went unexamined.

## Requirements

### Requirement: Every review lens returns the files it examined
Every review-lens subagent of `/code-review-max` SHALL end its report with a list of the changed files it examined, one repository path per entry, copied exactly as the changed-path list in the review brief writes it. The list SHALL be present whether the lens returns candidates or `NO FINDINGS`, and an empty list is a valid list. A file counts as examined only when the lens read its contents, meaning the changed lines of the file in the pinned diff or the file at the head commit. For a deleted file, which has no copy at the head, it means the removed lines in the pinned diff. A file that the lens only named, such as a path it took from the changed-path list or from a diff header, SHALL NOT be listed. A lens MAY read files outside the diff to prove a claim, and those files do not count toward coverage.

#### Scenario: A lens that finds nothing still reports what it examined
- **GIVEN** a full review whose correctness and security lens read `src/a.ts` and `src/b.ts` and found no problem
- **WHEN** the lens returns its report
- **THEN** the report says `NO FINDINGS` and ends with an examined-files list that holds `src/a.ts` and `src/b.ts`

#### Scenario: A named file is not an examined file
- **GIVEN** a lens that saw `src/c.ts` in the changed-path list but did not read its changed lines or the file
- **WHEN** the lens returns its report
- **THEN** `src/c.ts` is not in the examined-files list

#### Scenario: A file outside the diff does not count
- **GIVEN** a lens that opened `src/unchanged.ts`, which is not a changed file, to prove a claim
- **WHEN** coverage is checked
- **THEN** that path adds nothing to the coverage of any changed file and is not reported as unexamined

#### Scenario: A deleted file is examined by reading its removed lines
- **GIVEN** a changed file `src/old.ts` that the change deletes, and a lens that read its removed lines in the pinned diff
- **WHEN** the lens returns its report
- **THEN** `src/old.ts` is in the examined-files list, and a lens that only named it does not list it

### Requirement: A lens report without a usable examined-files list stops the review
The coverage check SHALL require one report from every lens the fan-out plan named, and no report from a lens it did not name. A report SHALL carry its lens name and an `examined` array of non-empty strings. A path SHALL NOT be absolute, SHALL NOT start with `./`, and SHALL NOT contain a line break or a NUL character. A repeated path inside one report is accepted and counted once. The check SHALL NOT trim, case-fold or otherwise change a path, either when it validates the report or when it matches the path, so an entry with whitespace around it is accepted as written and matches no changed file. When a planned lens has no report, when a report is malformed, or when two reports name the same lens, the check SHALL exit 1 with a plain message that names the lens and the problem, SHALL write no artifact, and SHALL NOT guess which files the lens examined. The review then stops, as it does for any other review-input failure, and runs no focused pass and no adjudication.

#### Scenario: A planned lens with no report stops the review
- **GIVEN** a fan-out plan that names four lenses and reports for only three of them
- **WHEN** the coverage check is run
- **THEN** it exits 1, names the missing lens, and writes no `lens-coverage.json`

#### Scenario: A malformed examined list stops the review
- **GIVEN** a report whose `examined` value is missing, is not an array, holds an empty string, or holds a path that is absolute or starts with `./`
- **WHEN** the coverage check is run
- **THEN** each input exits 1 with a message that names the lens, and no artifact is written

#### Scenario: An unplanned or repeated lens report stops the review
- **GIVEN** a report for a lens the plan did not name, or two reports for the same lens
- **WHEN** the coverage check is run
- **THEN** each input exits 1 with a message that names the lens, and no artifact is written

#### Scenario: A path is never trimmed
- **GIVEN** a changed file `src/a.ts` and a lens list that holds ` src/a.ts ` with a space on each side
- **WHEN** the coverage check is run
- **THEN** the report is accepted, the entry is not changed, and `src/a.ts` is listed as unexamined

### Requirement: The script finds the changed files and the review brief uses the same list
`review-fanout.ts` SHALL work out the changed files itself from the commit the diff starts from and the head, and no lens report, input file or conversation step SHALL supply or copy a path list into the coverage check. The commit the diff starts from is the base in a full-scope review and the earlier reviewed head, `since`, in a delta-scope review. The changed files are the paths of that diff with rename detection off and path quoting off, so a renamed file is listed as the old path removed and the new path added, and a path with non-ASCII characters is listed as written. The files under the change's own OpenSpec, `.delivery/` and `.review/` folders SHALL be left out, as `review-fanout.ts measure` leaves them out. They SHALL be listed in the order git lists them. A changed file that git reports as binary SHALL be listed apart from the text files. A changed path that holds a line break SHALL make the command exit 1 and name the path, because a lens report cannot carry it. `review-fanout.ts paths` SHALL print this list, and the changed-path list in the review brief SHALL be that output, so the strings the lenses are given are the strings the check matches. The existing `measure` command is not changed.

#### Scenario: A renamed file is two changed files with real paths
- **GIVEN** a change that renames `src/old.ts` to `src/new.ts`
- **WHEN** the changed files are listed
- **THEN** `src/old.ts` and `src/new.ts` are each listed as a changed path, and no entry holds `=>` or braces

#### Scenario: A non-ASCII path is listed as written
- **GIVEN** a change that adds `src/café.ts`
- **WHEN** the changed files are listed, and a lens report lists `src/café.ts`
- **THEN** the path is listed unquoted, and the lens report matches it

#### Scenario: The brief and the check use one list
- **GIVEN** the same base and head
- **WHEN** `review-fanout.ts paths` and the coverage check each list the changed files
- **THEN** the two lists are equal, in the same order

#### Scenario: A file the input never mentions is still checked
- **GIVEN** a change that touches `src/a.ts`, `src/b.ts` and `src/c.ts`, and an input that holds only reports that list `src/a.ts`
- **WHEN** the coverage check is run
- **THEN** `src/b.ts` and `src/c.ts` are listed as unexamined, because the check took the changed files from the diff and not from the input

#### Scenario: A path that cannot be written in a report stops the review
- **GIVEN** a changed file whose path holds a line break
- **WHEN** the changed files are listed
- **THEN** the command exits 1, names the path, and writes no artifact

### Requirement: Every changed file no lens examined is listed in the coverage artifact and the review output
After the lenses finish, `review-fanout.ts coverage` SHALL compare the changed files with the examined-files lists. The changed files are the text files the script found. A changed file is examined when at least one lens's list holds exactly that path, by exact string comparison. The check SHALL write `.review/mr-<iid>/<full-head-sha>/lens-coverage.json` with the status `checked`, the scope, the commit the diff started from, the head, the number of changed files, the lenses whose reports were read, and every unexamined changed file in listing order. The artifact SHALL be written before any focused pass starts. The review output SHALL name every unexamined file in a Coverage section, in plain language, and say when there is none.

A changed binary file has no text a lens can read. The artifact SHALL list it apart as a binary file, SHALL NOT count it as checked or unexamined, and SHALL NOT start a focused pass for it. The review output SHALL name each binary file as one that was not read as text. A lens that lists a binary file adds nothing.

In a delta-scope review the check SHALL also carry forward every file that the earlier review's coverage artifact records as still unexamined. The earlier artifact is the one the command is given with `--earlier`, and it SHALL record the head `since`. A carried file that is not already one of the delta paths SHALL be checked after the delta paths and marked as carried in the artifact. A file that is both a delta path and carried SHALL be checked once. An earlier artifact whose status is `skipped` carries nothing. An earlier artifact that does not exist carries nothing and the artifact records that no earlier coverage was found. An earlier artifact that exists but cannot be read, or that records another head, SHALL make the command exit 1 and write nothing. The review output SHALL name each carried file as one left over from the earlier review.

#### Scenario: Unexamined files are listed in the artifact
- **GIVEN** changed files `src/a.ts`, `src/b.ts` and `src/c.ts`, and lens reports that list `src/a.ts` and `src/b.ts` between them
- **WHEN** the coverage check is run
- **THEN** `lens-coverage.json` has the status `checked`, lists `src/c.ts` as the only unexamined file, and states that three files were checked

#### Scenario: A file one lens examined counts even when the other lenses did not
- **GIVEN** a file that only the tests and specification lens listed
- **WHEN** the coverage check is run
- **THEN** that file is not listed as unexamined

#### Scenario: Every file examined leaves nothing to pass
- **GIVEN** reports that between them list every changed file
- **WHEN** the coverage check is run
- **THEN** the artifact lists no unexamined file, no focused pass is needed, and the review output says every changed file was examined

#### Scenario: A delta review checks only the delta paths
- **GIVEN** a delta-scope review whose diff since the earlier head changes `src/b.ts` and `src/c.ts`, a full change that also touches `src/a.ts`, and no earlier unexamined file
- **WHEN** the coverage check is run
- **THEN** `src/a.ts` is neither checked nor listed, and the artifact records the scope as `delta`

#### Scenario: A file an earlier review left unexamined is carried into the delta check
- **GIVEN** a delta-scope review whose earlier artifact records `src/a.ts` as still unexamined, and a delta that changes only `src/b.ts`
- **WHEN** the coverage check is run with the earlier artifact
- **THEN** `src/a.ts` is checked and marked as carried, so it is listed as unexamined unless a lens lists it, and the review output names it as left over from the earlier review

#### Scenario: A carried file that is also a delta path is checked once
- **GIVEN** an earlier artifact that records `src/a.ts` as still unexamined, and a delta that also changes `src/a.ts`
- **WHEN** the coverage check is run
- **THEN** `src/a.ts` is checked once

#### Scenario: Missing, skipped and mismatched earlier artifacts
- **GIVEN** a delta-scope review whose earlier artifact does not exist, or has the status `skipped`, or records a head other than `since`, or cannot be read
- **WHEN** the coverage check is run
- **THEN** a missing or skipped artifact carries nothing, and the missing case is recorded as no earlier coverage found, while a mismatched or unreadable artifact exits 1 and writes nothing

#### Scenario: Paths the measure leaves out are not checked
- **GIVEN** a diff that also changes files under `openspec/` and `.review/`
- **WHEN** the coverage check is run
- **THEN** none of those files is listed as unexamined, and a lens that listed one adds nothing

#### Scenario: A path written differently from the changed path does not count
- **GIVEN** a changed path `src/a.ts` and a lens list that holds `src//a.ts`
- **WHEN** the coverage check is run
- **THEN** `src/a.ts` is listed as unexamined

#### Scenario: A binary file is named and never sent to a pass
- **GIVEN** a change that adds `assets/logo.png`, a binary file, and no lens lists it
- **WHEN** the coverage check is run
- **THEN** the artifact lists it as a binary file, it is not counted among the checked files or listed as unexamined, no focused pass is needed for it, and the review output names it as not read as text

#### Scenario: A deleted file is checked
- **GIVEN** a change that deletes `src/old.ts` and no lens lists it
- **WHEN** the coverage check is run
- **THEN** `src/old.ts` is listed as unexamined

### Requirement: Each unexamined file gets exactly one focused pass before adjudication
For every file the artifact lists as unexamined, the review SHALL start exactly one fresh read-only subagent on the resolved standard model tier, before adjudication begins. The subagent reads that one file, which for a deleted file means its removed lines in the pinned diff and for a carried file means the file at the head, and the code it needs outside it to prove a claim. It applies the correctness and security checks and the tests and specification checks of the lens brief to that file, and returns candidates in the same format as a lens report, ending with its own examined-files list. It SHALL NOT edit, comment, post, commit, or push. The passes for different files MAY run in one parallel batch. The candidates a pass returns SHALL be merged into `lens-candidates.json` and into the evidence given to the adjudicator before `review-fanout.ts adjudication` runs, so a candidate from a focused pass is adjudicated exactly like a lens candidate.

The script, and not the conversation, SHALL decide a pass's outcome. The conversation records for each pass either that it returned, with the examined-files list as the pass wrote it, or that it failed. The script SHALL record the outcome `examined` only when a returned list holds the pass's own file path, by the exact comparison above, and SHALL record `failed` for a returned list that does not, for a failed pass, and for a pass that listed other files but not its own. A pass adds no coverage for any file but its own. A failed record that carries a list, and a returned record without a usable list, SHALL make the command exit 1.

The script SHALL enforce the one pass per file rule from the data on disk. When `lens-coverage.json` already exists at the output path, the command SHALL read it, SHALL require it to name the same head and exit 1 otherwise, SHALL keep every outcome it records, and SHALL add the outcomes in the new input to them. The check SHALL return, as the files that need a pass, only the unexamined files with no recorded outcome, so a file with a recorded outcome, examined or failed, is never given a second pass, including after a resumed review that re-ran the lenses and wrote an input with no outcomes. A new outcome for a file that already has a recorded outcome SHALL be refused with exit 1.

#### Scenario: One pass per unexamined file
- **GIVEN** an artifact that lists `src/c.ts` and `src/d.ts` as unexamined and no recorded outcome
- **WHEN** the review continues
- **THEN** the check names exactly those two files as needing a pass, and one read-only subagent is started for each, not one for both

#### Scenario: A focused pass candidate reaches adjudication
- **GIVEN** a focused pass for `src/c.ts` that returns one Medium candidate
- **WHEN** the candidates are merged
- **THEN** `lens-candidates.json` holds that candidate beside the lens candidates, the adjudication mode is `main`, and the adjudicator's evidence includes the pass's candidates

#### Scenario: A pass that reads the file closes the gap
- **GIVEN** a focused pass whose examined-files list holds `src/c.ts`
- **WHEN** its outcome is recorded
- **THEN** `lens-coverage.json` shows `src/c.ts` as examined by a focused pass, and the review output does not name it as still unexamined

#### Scenario: A pass that does not list its file counts as failed
- **GIVEN** a focused pass that returns candidates but whose examined-files list does not hold its file, and that the conversation recorded as returned
- **WHEN** its outcome is recorded
- **THEN** the script records the outcome as `failed`, and the file stays recorded as still unexamined

#### Scenario: A pass cannot cover another file
- **GIVEN** a focused pass for `src/c.ts` whose list holds `src/d.ts` and not `src/c.ts`
- **WHEN** its outcome is recorded
- **THEN** `src/c.ts` is recorded as `failed` and `src/d.ts` gains no coverage from the pass

#### Scenario: An outcome record that cannot be read is refused
- **GIVEN** a failed pass recorded with an examined-files list, or a returned pass recorded with no list or a malformed one
- **WHEN** the check is run
- **THEN** it exits 1 and names the path, and the artifact is not changed

#### Scenario: A recorded outcome is never passed again
- **GIVEN** an artifact that records an outcome for `src/c.ts`, whether `examined` or `failed`, and the check run again for the same review
- **WHEN** the check returns the files that need a pass
- **THEN** `src/c.ts` is not among them, and a second outcome for the same file is refused with exit 1

#### Scenario: A resumed review does not repeat a pass
- **GIVEN** a review resumed at the same head, whose lenses ran again and whose new input holds no outcomes, and an existing artifact that records an outcome for `src/c.ts` and leaves `src/d.ts` without one
- **WHEN** the check is run
- **THEN** only `src/d.ts` needs a pass, and the rewritten artifact still records the outcome for `src/c.ts`

#### Scenario: An artifact for another head is not reused
- **GIVEN** an existing `lens-coverage.json` at the output path that records a head other than the review's head
- **WHEN** the check is run
- **THEN** it exits 1, names the mismatch, and leaves the artifact unchanged

#### Scenario: An outcome for a file that was never unexamined is refused
- **GIVEN** an outcome for a path that no lens left unexamined
- **WHEN** the check is run
- **THEN** it exits 1 and names the path, and the artifact is not changed

### Requirement: A failed focused pass leaves its file named and adjudication continues
When a focused pass fails, by returning an error, by returning no usable report, by returning a report whose examined-files list does not hold its file, or by being unable to start, the review SHALL record the outcome `failed` for that file and SHALL NOT stop, retry the pass, or block adjudication. The file SHALL stay in `lens-coverage.json` as still unexamined and SHALL be named in the Coverage section of the review output as a file that no lens and no focused pass examined. Candidates returned by the other passes and by the lenses are adjudicated as usual. The Coverage section does not change the verdict, which stays the result of the adjudicated findings.

#### Scenario: A failed pass does not block adjudication
- **GIVEN** two unexamined files, one whose pass fails and one whose pass returns a Low candidate
- **WHEN** the outcomes are recorded and the review continues
- **THEN** adjudication runs on the merged candidates, and the failed file is recorded as `failed`

#### Scenario: A failed pass is named in the review output and never repeated
- **GIVEN** a file whose focused pass failed
- **WHEN** the review output is written
- **THEN** its Coverage section names that file as still unexamined, and no second pass is started for it in the same review

#### Scenario: Coverage alone does not set the verdict
- **GIVEN** a review whose lenses and focused passes returned no candidate and whose failed pass leaves one file still unexamined
- **WHEN** the review output is written
- **THEN** the verdict is `PASS`, the findings say `No findings.`, and the Coverage section names the file

### Requirement: The coverage check is skipped and the skip recorded when no lens ran
When `review-fanout.ts` returns no lenses for the review, so that no lens subagent is dispatched, the coverage check SHALL NOT compare files and no focused pass SHALL run. The check SHALL still be run with an empty plan and no reports, and SHALL write `lens-coverage.json` with the status `skipped`, the scope, an empty unexamined list, and a plain reason that says no lens ran. The review output SHALL say that the coverage check was skipped because no lens ran. A review where lenses were planned but did not report is not a skip and stops the review as the earlier requirement says.

#### Scenario: A review with no lenses records the skip
- **GIVEN** a measured diff with no reviewable code, so the fan-out plan has no lenses
- **WHEN** the coverage check is run with an empty plan and no reports
- **THEN** `lens-coverage.json` has the status `skipped`, a reason that says no lens ran, and no unexamined file, and no focused pass is dispatched

#### Scenario: The review output says the check was skipped
- **GIVEN** a skipped coverage check
- **WHEN** the review output is written
- **THEN** its Coverage section says the coverage check was skipped because no lens ran, and does not say every file was examined

### Requirement: Coverage means reported examination
The coverage artifact and the Coverage section SHALL describe the result as files the lenses and focused passes reported examining, and SHALL NOT say they were verified to have been read. The check SHALL prove that each changed file was claimed by at least one lens or pass, and it SHALL NOT measure coverage inside a file. The specification, the skill wording, and the reference documentation SHALL state this limit.

#### Scenario: The output does not claim more than the reports say
- **GIVEN** a checked coverage result
- **WHEN** the Coverage section is written
- **THEN** it says the files were reported as examined, and the skill, the reference and the workflow documentation each say that the list is self-reported by the lens

#### Scenario: A file is not scored by how much of it was read
- **GIVEN** a lens that lists a file after reading only part of its changed lines
- **WHEN** the coverage check is run
- **THEN** the file counts as examined and nothing about the extent of the reading is recorded
