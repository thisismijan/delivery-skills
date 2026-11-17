# review-memory Specification

## Purpose
Remember candidates a review disproved on a merge request by the code they cited, so a re-review flags a candidate on the same unchanged code for the adjudicator instead of re-investigating it, and judges it fresh once that code changes.

## Requirements

### Requirement: A disproved candidate is remembered with its reason and the code it cited
The script `factory/scripts/review-memory.ts` SHALL provide a `record` command that stores, for one merge request, each review candidate the adjudicator disproved by fresh judgement. The memory SHALL be one file per merge request at `.review/mr-<iid>/rejected.json` under the repository root, outside the per head directories, so a review at a later head reads what an earlier head's adjudication disproved. The file SHALL hold entries, each one a cited path and the cited code as it was at the head the adjudicator read, with the rejections made there. Each rejection SHALL hold the claim title, the reason, the full SHA of the head the adjudicator read, and the lines the code stood on at that head. An entry SHALL be identified by its path and its cited code alone, and no title SHALL be part of that identity. The cited code SHALL be read from the repository at the head with `git show`, never from the working tree, and stored with each line trimmed, inner runs of whitespace collapsed to one space, and blank lines left out. The file SHALL carry `version` 1 and be validated on every read. A disproved candidate whose path and cited code match an existing entry SHALL add a rejection to that entry, an exact repeat of a title there SHALL replace that rejection, and an entry SHALL keep at most its 5 newest rejections. Each disproved candidate SHALL carry the line it cited and the range the adjudicator read, and the cited line SHALL lie inside that range. When the claim was disproved by something outside that range, such as a guard or a caller that rejects the input, the candidate SHALL name each such place as a guard, up to 3 places, each a path and a line range of at most 80 lines, and `record` SHALL read each at the head and store it with that rejection, normalised the same way, so a rejection carries every piece of code it rests on. A `record` run whose arguments or repository are unusable, meaning a merge request id that is not digits, a head that is not a full SHA or not a commit in the repository, or a memory file or filter file that cannot be read, SHALL exit 1 with a plain message and leave the memory file as it was. A `record` run whose outcome file is refused SHALL exit 3, and a refusal SHALL cover an outcome that is not valid JSON or has an unknown key, and any item with a cited or guard path or line range that does not exist at the head, a cited line outside its range, a range of more than 80 lines, more than 3 guards, a title over 200 characters or a reason over 600, an unsafe path, or an empty reason or title. A refused outcome SHALL be reported in full: the message SHALL name every refused item, in plain words, by which list it is in and its position in that list, with the problem, so one correction can fix them all. A refused `record` SHALL leave the memory file as it was, creating none when none existed.

#### Scenario: A disproved candidate is stored with its reason and cited code
- **GIVEN** a repository whose head `H1` has `src/parse.ts` with a `parse` function on lines 10 to 14, and an outcome naming one disproved candidate titled `Parse crashes on empty input` for `src/parse.ts`, cited at line 12, with the range 10 to 14 and the reason `The caller rejects empty input before parse is reached.`
- **WHEN** `record` runs for merge request `840` at `H1`
- **THEN** it exits 0, `.review/mr-840/rejected.json` holds `version` 1 and one entry for `src/parse.ts` whose cited code is lines 10 to 14 as read from `H1` and which holds one rejection with that title, that reason, the recorded head `H1`, and the lines 10 and 14, and the file sits directly under `.review/mr-840/`, not under a head directory

#### Scenario: Cited code is read from the pinned head, not the working tree
- **GIVEN** the same repository with `src/parse.ts` edited in the working tree after `H1` and not committed
- **WHEN** `record` runs at `H1`
- **THEN** the stored cited code is the lines as committed at `H1`

#### Scenario: A second rejection at the same place is added, not substituted
- **GIVEN** a memory file with one entry for `src/parse.ts` recorded at `H1`, and a later head `H2` where that code is unchanged
- **WHEN** `record` runs at `H2` for a candidate with the same path and range and a different title and reason
- **THEN** the file holds one entry for that path and code with two rejections, the earlier one unchanged and the new one recorded at `H2`, and a third run with a title identical to the first replaces the first rejection instead of adding a third

#### Scenario: A record that cannot be trusted leaves the memory untouched
- **GIVEN** a memory file with one entry, and an outcome with two disproved candidates of which the second cites `src/missing.ts` that does not exist at the head
- **WHEN** `record` runs
- **THEN** it exits 3, the message names the second disproved candidate and `src/missing.ts` and says the cited code was not found at that head, and the memory file is byte for byte what it was, with the first candidate not stored either

#### Scenario: Every refused item is named at once
- **GIVEN** an outcome with three refused items: a disproved candidate at a missing path, a disproved candidate whose cited line is outside its range, and a dropped candidate that the filter did not mark, plus one valid disproved candidate
- **WHEN** `record` runs
- **THEN** it exits 3, one message names all three refused items by list and position with their own problem and does not name the valid one, the message uses plain words and no raw field names, and the memory file is unchanged

#### Scenario: A cited line outside the range read is refused
- **GIVEN** an outcome naming a disproved candidate cited at line 30 with the range 10 to 14
- **WHEN** `record` runs
- **THEN** it exits 3 with a plain message that the cited line is not inside the range the adjudicator read, and no memory file is created

#### Scenario: A range that is too large, an empty reason, or an unknown head is refused
- **GIVEN** a repository and an outcome naming a range of 81 lines, or an empty reason, or more than 3 guards, or a valid outcome run at a full SHA that is not a commit in the repository, or at something that is not a full SHA
- **WHEN** `record` runs on each
- **THEN** the run with the large range, the empty reason, or the extra guard exits 3 and each of the other two exits 1, each with its own plain message, and no memory file is created

#### Scenario: A rejection stores the guard it rests on
- **GIVEN** `src/parse.ts` with a `parse` function on lines 10 to 14 and `src/caller.ts` with a check on lines 3 to 5 that rejects empty input before `parse` is reached, and an outcome naming a disproved candidate for `parse` with a guard at `src/caller.ts` lines 3 to 5
- **WHEN** `record` runs
- **THEN** it exits 0 and the stored rejection holds the normalised lines of `src/caller.ts` lines 3 to 5 as read at the head, beside the cited code of `parse`

### Requirement: A prior rejection at unchanged code is reported, never applied
The script SHALL provide a `filter` command that takes the lens candidates of a review and a pinned head and reports, for each candidate, either a prior rejection at its location or that it is fresh. A candidate has an id and a path, and may have a cited line and an end line. It carries no title, and no title SHALL take part in the match. A candidate SHALL be reported `prior-rejection-at-location` when it cites a line, the memory holds an entry for its path, the entry's cited code is still present at the pinned head, found by comparing its normalised lines with the normalised non-blank lines of the file as read with `git show` at that head, and the candidate's cited line falls inside a range where that code is found, or overlaps it from the line to the end line when that is given. A remembered rejection SHALL be reported only when every guard stored with it is also still present at the pinned head, found as a contiguous run of normalised lines anywhere in its file, because a rejection that rested on a guard no longer holds once the guard is gone. A rejection with a missing guard SHALL be left out of the report, and a candidate left with no rejection to report SHALL be `fresh`. The document SHALL list every reported rejection with its title, reason, recorded head, lines, and a reference that identifies it, newest first, in a `rejections` section placed last in the document, and each reported candidate's result SHALL say only that it has a prior rejection. That section SHALL be no longer than a budget that is smaller than the characters the review packet keeps of an evidence file, measured on the text as printed, and the budget SHALL be derived from the packet's own constant, so the whole of the section always reaches the adjudicator. Candidates SHALL be taken in input order and each candidate's rejections newest first, and a rejection that does not fit the remaining budget SHALL be left out and counted as omitted, and a candidate with none that fits SHALL be `fresh`. Omission only ever sends a candidate to a fresh judgement. Line numbers SHALL NOT take part in the comparison, so unrelated edits above the cited code, which move it, SHALL NOT make it changed. A whitespace-only edit inside the cited code SHALL NOT make it changed. `filter` SHALL NOT remove, hide, or mark as dropped any candidate: it prints one JSON document with a result for every candidate in the input order, and exits 0 whenever it could read its input and the memory. The report SHALL be the same for a full review and a delta review, because it depends only on the candidates, the memory, and the pinned head.

#### Scenario: A prior rejection is reported on unchanged code
- **GIVEN** a memory entry for `src/parse.ts` with one rejection titled `Parse crashes on empty input`, whose cited code is unchanged at the pinned head `H2`
- **WHEN** `filter` runs at `H2` on a candidate with that path and a cited line inside the code
- **THEN** that candidate's result is `prior-rejection-at-location`, the `rejections` section of the output lists for it the remembered title, reason, and recorded head, and every candidate is still present in the output

#### Scenario: Code that moved down the file is still unchanged
- **GIVEN** a memory entry recorded with the cited code on lines 10 to 14, and a later head in which six unrelated lines were added above it and nothing inside it changed
- **WHEN** `filter` runs on a candidate whose cited line is 17, inside the moved code
- **THEN** the candidate is `prior-rejection-at-location`

#### Scenario: A whitespace-only edit inside the cited code is still unchanged
- **GIVEN** a memory entry and a later head in which the cited lines were re-indented and had trailing spaces added, with the same text otherwise
- **WHEN** `filter` runs on a candidate that cites a line in that code
- **THEN** the candidate is `prior-rejection-at-location`

#### Scenario: A differently worded candidate at the same place still reports the prior rejection
- **GIVEN** a memory entry whose one rejection has the title `Parse crashes on empty input`
- **WHEN** `filter` runs on a candidate at the same path and a cited line inside the code, whose input has no title at all
- **THEN** the result is `prior-rejection-at-location` and the `rejections` section lists that remembered title for it, because the match uses the path and the code only

#### Scenario: The same report is made in a delta review
- **GIVEN** a memory entry for a claim in a file the earlier review covered, a later head that changes another file only, and a `review-scope.json` that says `delta`
- **WHEN** `filter` runs on a candidate at that place at the later head
- **THEN** the candidate is `prior-rejection-at-location`

#### Scenario: The same code in two places does not attach a reason to a different place
- **GIVEN** a memory entry whose cited code now appears twice in the file at the pinned head, at lines 10 to 14 and at lines 60 to 64
- **WHEN** `filter` runs on a candidate whose cited line is 62, and on another whose cited line is 30
- **THEN** the first is `prior-rejection-at-location` and the second is `fresh`

#### Scenario: A rejection whose guard was removed is no longer reported
- **GIVEN** a memory entry for `parse` in `src/parse.ts` whose one rejection stored a guard at `src/caller.ts`, a later head that leaves the cited code of `parse` unchanged and deletes the check in `src/caller.ts`, and another entry whose rejection stored no guard
- **WHEN** `filter` runs on a candidate that cites a line in the first entry's code, and on one that cites a line in the second
- **THEN** the first candidate is `fresh` with the cause `guard-changed` and carries no remembered reason, and the second is `prior-rejection-at-location`

#### Scenario: A guard that moved within its file is still present
- **GIVEN** the same rejection and a later head that adds unrelated lines above the guard in `src/caller.ts` and leaves the guard's text unchanged
- **WHEN** `filter` runs on a candidate in the cited code of `parse`
- **THEN** the candidate is `prior-rejection-at-location`

#### Scenario: Rejections that do not fit the packet are left out and never cut
- **GIVEN** a memory with enough long rejections that listing them for the candidates would exceed the budget, which is below the packet's evidence limit
- **WHEN** `filter` runs on those candidates
- **THEN** its last section holds whole rejections only and is no longer than the budget, a candidate whose rejections were all left out is `fresh` with the cause `memory-over-budget`, a candidate with some left out says how many were omitted, every candidate is still in the output, and the last `EVIDENCE_TAIL_CHARS` characters of the output, as the packet keeps them, still contain the whole `rejections` section

### Requirement: A candidate at changed code, or without a line, is judged afresh
`filter` SHALL report a candidate `fresh` when no remembered rejection applies, with a cause. The cause SHALL be `cited-code-changed` when the memory holds an entry for the candidate's path and its cited code is not found at the pinned head around the candidate's cited line, because a line of it changed in content, a line of it is gone, the file no longer exists at the head, or the candidate's cited line is not inside a place where the code is found. The cause SHALL be `guard-changed` when the cited code is unchanged but every rejection there rested on a guard that is no longer present. The cause SHALL be `memory-over-budget` when rejections apply but none fits the budget for the document's rejection section. The cause SHALL be `no-record` when the memory holds no entry for the candidate's path, or the candidate's path is not a safe repository relative path. The cause SHALL be `no-line` when the candidate cites no line, whatever the memory holds. A fresh result SHALL carry nothing of any earlier reason and the candidate SHALL go to adjudication exactly as a candidate with no memory does. A candidate that cites no line SHALL pass through as fresh and SHALL NOT make `filter` fail or stop the review. A candidate path that does not exist at the head and has no entry SHALL be `fresh` with the cause `no-record`, and `filter` SHALL NOT fail because of it. A path taken from a candidate SHALL NOT be passed to `git`.

#### Scenario: A changed line in the cited code makes the candidate fresh
- **GIVEN** a memory entry for a claim and a later head in which one line of the cited code was edited so its text differs
- **WHEN** `filter` runs on a candidate that cites a line there
- **THEN** its result is `fresh` with the cause `cited-code-changed` and it carries no remembered reason

#### Scenario: A removed line, a deleted file, or a renamed file makes the candidate fresh
- **GIVEN** a memory entry for `src/parse.ts`, and three later heads: one that deletes one cited line, one that deletes `src/parse.ts`, and one that renames it to `src/parser.ts`
- **WHEN** `filter` runs at each head on a candidate with the path `src/parse.ts`, and on a candidate with the path `src/parser.ts`
- **THEN** every result is `fresh`, with the cause `cited-code-changed` for the old path and `no-record` for the new one

#### Scenario: A candidate with no cited line passes through as fresh
- **GIVEN** a memory entry for `src/parse.ts`, and a list of two candidates: one for `src/parse.ts` that cites no line, and one for `src/parse.ts` that cites a line in unchanged cited code
- **WHEN** `filter` runs
- **THEN** it exits 0, the first result is `fresh` with the cause `no-line`, the second is `prior-rejection-at-location`, and no candidate is refused

#### Scenario: A path that is not safe is fresh and is not read
- **GIVEN** a candidate whose path is `../outside.ts`, and another whose path is absolute
- **WHEN** `filter` runs
- **THEN** both are `fresh` with the cause `no-record`, it exits 0, and `git` was not asked for either path

### Requirement: Memory applies to one merge request and changes nothing for other candidates
The memory file SHALL be read and written only at `.review/mr-<iid>/rejected.json` for the merge request being reviewed. A rejection recorded for one merge request SHALL NOT be reported in the review of another. A candidate that was never rejected and one rejected only on a different merge request SHALL be `fresh` with the cause `no-record`, and a review in which every candidate is fresh SHALL proceed exactly as it did before the memory existed. The merge request id SHALL be digits only and the head SHALL be a full 40 character SHA, and either failing SHALL exit 1 with a plain message and touch nothing. A memory file that is not valid JSON, has another `version`, or fails its schema SHALL make `filter` and `record` exit 1 with a message that names the file and says deleting it forgets the remembered rejections, and neither command SHALL rewrite it.

#### Scenario: A rejection on another merge request is not reported
- **GIVEN** a memory entry for a place in `.review/mr-840/rejected.json` and no file for merge request `841`
- **WHEN** `filter` runs for merge request `841` on a candidate at the same path and a line in unchanged code
- **THEN** the candidate is `fresh` with the cause `no-record`, and `.review/mr-841/` is not created by it

#### Scenario: A candidate that was never rejected is fresh and the review is unchanged
- **GIVEN** a memory file with one entry and a list of three candidates, none of which has that path
- **WHEN** `filter` runs
- **THEN** all three results are `fresh` with the cause `no-record` and the memory file is not modified

#### Scenario: No memory file means every candidate is fresh
- **GIVEN** a merge request with no `rejected.json`
- **WHEN** `filter` runs on two candidates
- **THEN** both are `fresh` with the cause `no-record`, it exits 0, and no file is created

#### Scenario: A corrupt or unknown memory is refused and left alone
- **GIVEN** a memory file that holds `not json`, and another that holds `{"version":2,"entries":[]}`
- **WHEN** `filter` and `record` run against each
- **THEN** every run exits 1, the message names the file and says deleting it forgets the remembered rejections, and the file's bytes are unchanged

#### Scenario: A bad merge request id or head is refused
- **GIVEN** a merge request id of `8x0` or a head of `abc123`
- **WHEN** `filter` runs
- **THEN** it exits 1 with a plain message and nothing is written

### Requirement: The adjudicator compares the claim before it re-investigates
The code review skill SHALL give every lens candidate an id, SHALL keep every candidate in `lens-candidates.json` so the adjudication mode is chosen from all of them, and SHALL give the adjudicator `memory-filter.json` in the adjudication packet as its last evidence file, so its `rejections` section is the last text the packet keeps. Before reading any cited code, the adjudicator SHALL compare each candidate marked `prior-rejection-at-location` with the remembered rejections listed for it, by the bad behaviour and trigger the candidate states and not by its wording. When the candidate describes the same bad behaviour under the same trigger as a remembered rejection, the adjudicator SHALL drop it without re-investigating, SHALL NOT record it again, and SHALL name it, with the reference of that rejection, under `droppedAsPreviouslyDisproved` in its outcome. When it does not, or when the adjudicator cannot tell, it SHALL judge the candidate afresh by the numbered adjudication steps. A candidate marked `fresh` SHALL go straight to those steps. A candidate marked `prior-rejection-at-location` and judged afresh SHALL still be judged on the code at the pinned head, so the remembered reason is context and never evidence.

#### Scenario: The skill gives every candidate an id and keeps every candidate
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its adjudication section is read
- **THEN** it says to give every candidate an id, to write the ids into `lens-candidates.json` with the severities, and not to remove a candidate because of the filter's result, and the `review-packet.ts` command in it ends with `memory-filter.json` as its last `--evidence` file

#### Scenario: The skill orders the comparison before any investigation
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** the numbered adjudication steps are read
- **THEN** a step before reading any cited code says to compare a `prior-rejection-at-location` candidate with the remembered rejections by behaviour and trigger, to drop the same claim without re-investigating, to judge any other candidate afresh, and to judge afresh when unsure

#### Scenario: A candidate dropped as previously disproved is named and not recorded again
- **GIVEN** an outcome whose `droppedAsPreviouslyDisproved` names candidate `c1` and the reference of one of its listed rejections, and a `memory-filter.json` in which `c1` is `prior-rejection-at-location` with that rejection listed
- **WHEN** `record` runs
- **THEN** it exits 0, the memory file holds exactly the rejections it held before, and the printed list has one bullet for `c1`

#### Scenario: A dropped candidate that the filter did not mark is refused
- **GIVEN** an outcome whose `droppedAsPreviouslyDisproved` or `reversed` names a candidate that is `fresh` in `memory-filter.json`, or a reference that is not among that candidate's listed rejections, or the same candidate and reference in both lists, or whose `memory-filter.json` does not exist
- **WHEN** `record` runs on each
- **THEN** the run with the missing filter file exits 1 and each of the others exits 3, each with a plain message naming the candidate and the problem, and the memory file is unchanged

### Requirement: Only candidates the adjudicator disproved by fresh judgement are recorded
The code review skill SHALL record a candidate only when adjudication found the claim false for the code at the pinned head: by reading the cited code, by a focused reproduction or test, by finding an existing guard that clears the risk, or by showing that the trigger cannot occur. It SHALL NOT record a duplicate, a claim dropped because it was already raised in the change discussions, a candidate downgraded to a lower severity and still raised, a claim dropped because it rests only on a name, comment, or assertion, a style preference, or a candidate dropped as previously disproved. The reason it records SHALL be plain language that uses repository relative paths only. It SHALL name as a guard every place outside the range it read that the disproof rests on, up to 3, and SHALL NOT record a claim whose disproof rests on more places than that or on something no file's lines show, such as runtime configuration, stored data, or an outside service, so a rejection is only ever remembered with everything that made it true. When it raised a finding that is the same claim as a remembered rejection listed for a candidate, it SHALL list that candidate and that rejection's reference under `reversed` in the `record` outcome, and `record` SHALL remove only that rejection, and the entry too when it then holds none, so a rejection the adjudicator has contradicted is not reported again and every other rejection at the place is kept. A finding that is a different claim from every listed rejection SHALL reverse nothing. A `reversed` item whose rejection is no longer in the memory SHALL change nothing.

#### Scenario: The skill names what is recorded and what is not
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its adjudication section is read
- **THEN** it says to record a candidate found false by reading the code, a reproduction, an existing guard, or an impossible trigger, to name each guard outside the range read, and not to record a claim whose disproof rests on more than 3 such places or on something no file's lines show, and says never to record a duplicate, a claim already raised in the discussions, a downgrade, a claim resting only on a name or comment, a style preference, or a candidate dropped as previously disproved

#### Scenario: A reversed rejection is removed and only that one
- **GIVEN** a memory file with one entry holding two rejections of unrelated claims, and a `memory-filter.json` that lists both for candidate `c1`
- **WHEN** `record` runs with an outcome that names `c1` and the reference of the first rejection under `reversed` and has no new disproved candidates
- **THEN** the entry holds only the second rejection, and when `reversed` then names the second one too the entry is gone

#### Scenario: Reversing a rejection that is already gone changes nothing
- **GIVEN** a `memory-filter.json` that lists a rejection for `c1` and a memory file from which that rejection has since been removed
- **WHEN** `record` runs with an outcome that reverses it
- **THEN** it exits 0, nothing is removed, and the memory file is as it was

#### Scenario: A finding that is a different claim reverses nothing
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its adjudication section is read
- **THEN** it says to reverse a remembered rejection only when the finding raised is the same claim as that rejection, by its behaviour and trigger, to name it by candidate and reference, and to reverse nothing when the finding is a different claim

### Requirement: Every adjudication mode gives the record step its input
The code review skill SHALL define what each adjudication mode returns, so `record` has real input however the review was adjudicated. In `main` mode the main conversation SHALL write `.review/mr-<iid>/<full-head-sha>/memory-outcome.json` itself. In `standard` mode the read-only adjudication subagent SHALL end its reply with one fenced JSON object holding `findings`, the numbered findings in the output format, and `outcome`, the same object `record` reads, and the main conversation SHALL write `outcome` unchanged to `memory-outcome.json` and run `record`. The subagent SHALL NOT write the memory file or run `record`. A standard-mode reply with no such object, or whose `outcome` `record` refuses, SHALL NOT be recorded from prose, and the main conversation SHALL adjudicate that review itself in `main` mode. When no lens returned a candidate the mode is `none`, there is nothing to adjudicate, and the filter and record steps SHALL be skipped.

#### Scenario: The skill defines the standard-mode return
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its `standard` mode paragraph is read
- **THEN** it says the subagent ends its reply with one JSON object holding `findings` and `outcome`, that the main conversation writes `outcome` to `memory-outcome.json` and runs `record`, that the subagent does neither, and that a missing or refused object means the main conversation adjudicates instead

#### Scenario: Record accepts the outcome a subagent returns
- **GIVEN** an outcome object in the shape the skill states, with one disproved candidate, one reversed rejection, and one dropped candidate
- **WHEN** `record` runs on it as a file
- **THEN** it exits 0, stores the disproved candidate, removes the reversed rejection, prints the list for the dropped candidate, and prints the counts it recorded and reversed

#### Scenario: An outcome with an unknown key is refused
- **GIVEN** an outcome with a key the shape does not define
- **WHEN** `record` runs
- **THEN** it exits 3 with a plain message and the memory file is unchanged

### Requirement: A refused outcome does not stop the review
When `record` exits 3 in `main` mode, the main conversation SHALL read the message, which names every refused item, correct each named item from the code and the filter result, and run `record` again. When that second run is also refused, the main conversation SHALL remove each item still named and run `record` once more, and the review SHALL go on. A removed `disproved` or `reversed` item is simply not remembered, which costs a fresh judgement in a later review and never a finding. A removed `droppedAsPreviouslyDisproved` item SHALL revoke that drop: the candidate SHALL be judged by the numbered adjudication steps and any finding from it SHALL be in the output. When any item was removed, the output SHALL say so under the verification list in plain words that give the number of items and that review memory was not updated for them, with no field names. An exit of 1 from `record` or `filter`, which means the arguments, the repository, or a memory or filter file are unusable, SHALL still stop the review, since a repeat cannot succeed. The review's findings SHALL NOT be lost or delayed by a refused outcome, because the output is written after the last `record` run, which always either succeeds or stops the review for a cause the operator must fix.

#### Scenario: The skill says how to recover from a refused outcome
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its record step is read
- **THEN** it says that an exit of 3 names every refused item, that the conversation corrects them and runs `record` again, that items still refused after that are removed and `record` runs once more, that a removed disproved or reversed item is not remembered, that a removed dropped item is judged afresh and its findings are kept, that the output says in plain words how many items were not remembered, and that an exit of 1 stops the review

#### Scenario: A refused outcome corrected once is recorded in full
- **GIVEN** an outcome refused with exit 3 for one disproved item whose line is outside its range, and the same outcome with that item's range fixed
- **WHEN** `record` runs on the second
- **THEN** it exits 0 and stores both disproved items of the outcome

#### Scenario: Removing the still-refused items leaves a recordable outcome
- **GIVEN** an outcome refused with exit 3 for two items, one disproved and one reversed, and the same outcome with those two items removed
- **WHEN** `record` runs on the second
- **THEN** it exits 0 and stores the items that were not removed

### Requirement: Dropped candidates are shown, not silently dropped
When the adjudicator drops any candidate as previously disproved, the code review output SHALL carry a `### Previously disproved` list, placed after the findings and before the verification list, with one line for each such candidate that gives its path and line, the remembered title, the earlier reason, and the short head it was disproved at, so the operator can see what was left out and override a wrong earlier rejection by deleting the memory file. The list text SHALL be produced by `record`, with the remembered title and reason run through the shared human text sanitiser, which replaces an em or en dash with a spaced hyphen and does nothing else, and the skill SHALL paste it as given. The list SHALL NOT be relied on to remove a path or any other raw text, which the recorded reason is written to avoid. When nothing was dropped as previously disproved the section SHALL be left out. A review in which every candidate was dropped as previously disproved SHALL report `No findings.` and a `PASS` verdict followed by the section, and SHALL NOT use the `none` mode path, which means only that no lens returned a candidate and has no list.

#### Scenario: The dropped list is one bullet per candidate with the earlier reason
- **GIVEN** a remembered rejection titled `Parse crashes on empty input` with the reason `The caller rejects empty input before parse is reached.` and recorded head `H1`, listed for candidate `c1` in `memory-filter.json`, and an outcome that drops `c1`, cited at `src/parse.ts` line 12, as that claim
- **WHEN** `record` runs
- **THEN** the printed list is one bullet that names `src/parse.ts:12`, the title, the reason, and the first 12 characters of `H1`

#### Scenario: The sanitiser rule is the one the sanitiser has
- **GIVEN** a remembered rejection whose reason is `Empty input is rejected by the caller — parse is never reached.`
- **WHEN** its candidate is dropped and `record` prints the list
- **THEN** the bullet shows the reason with the dash replaced by a spaced hyphen, and the test asserts the dash rule and no other cleaning

#### Scenario: Nothing dropped leaves out the section
- **GIVEN** a `record` run whose outcome has no `droppedAsPreviouslyDisproved`
- **WHEN** its output is read
- **THEN** the list is the empty string and the skill's output template says the section is left out when nothing was dropped

#### Scenario: A review whose every candidate was dropped still shows the section
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its output rules are read
- **THEN** they say that when every candidate was dropped as previously disproved the output reads `No findings.` with a `PASS` verdict and still carries the `### Previously disproved` list, and that the `none` mode, with no candidates, has no such list

#### Scenario: The second-pass review treats the section as context
- **GIVEN** `skills/mr-review/SKILL.md`
- **WHEN** its consolidation phase is read
- **THEN** it says the `### Previously disproved` list in the correctness pass is context and not a finding, that it is not carried, posted, or counted, that it is printed to the operator with the drafts and left out of `summary.md`, and that `mr-review` raises a listed claim only as its own finding with its own evidence

### Requirement: A later delta review never reads the dropped list as findings
In a `delta` review the code review skill SHALL give the lenses the earlier review without its `### Previously disproved` section, written to `.review/mr-<iid>/<full-head-sha>/earlier-review.md`, and SHALL add to the lens brief that the earlier review holds findings only and that nothing in it is a finding to confirm, carry, or report. The `### Earlier findings` list in the output SHALL name earlier findings only, and the `### Previously disproved` list from the earlier review SHALL NOT be copied into the later one: the later list holds only what the later review dropped. A `full` review gives the lenses no earlier review and is unchanged.

#### Scenario: The skill hides the dropped list from the delta lenses
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its `delta` scope paragraph is read
- **THEN** it says to give the lenses the earlier review without the `### Previously disproved` section as `earlier-review.md`, tells the lenses that nothing in the earlier review but its findings is to be confirmed or reported, says `### Earlier findings` names findings only, and says the earlier dropped list is not carried forward

#### Scenario: An earlier output with a dropped list yields no phantom findings
- **GIVEN** an earlier `max.md` that reads `No findings.` with a `PASS` verdict and a `### Previously disproved` list of `src/parse.ts:12`
- **WHEN** the skill's delta paragraph is followed for a later head
- **THEN** the review the lenses receive has no `src/parse.ts:12` line and no `### Previously disproved` heading, and `review-scope.ts` still reads the earlier verdict from the unchanged `max.md`

### Requirement: The review skill and docs use the memory through the script's own invocations
`skills/code-review-max/SKILL.md` SHALL run `filter` after the lenses return and before the adjudication mode is chosen, with the invocation string the script exports as `REVIEW_MEMORY_FILTER_INVOCATION`, and SHALL persist the result at `.review/mr-<iid>/<full-head-sha>/memory-filter.json`. It SHALL run `record`, with `REVIEW_MEMORY_RECORD_INVOCATION`, after adjudication and before it writes its output. An exit of 1 from either SHALL stop the review, and an exit of 3 from `record` SHALL follow the recovery above. The skill, the workflow `skills/delivery/workflows/mr-review-to-ready.md`, `docs/workflow.md`, and `docs/reference.md` SHALL state that the memory is for the same merge request only, that it is kept under the worktree-local `.review/` and so is lost on a fresh clone or another runtime, and that it does not track fixed findings. `docs/reference.md` SHALL carry both exported invocation strings. A copied name, command, or file path SHALL be derived in a test from the script's exports and the skill's text, so the docs cannot drift from the script.

#### Scenario: The skill runs filter before adjudication and record after it
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** the position of each command is read
- **THEN** the filter invocation comes after the lens dispatch and before the `review-fanout.ts adjudication` command, the record invocation comes after the numbered adjudication steps and before the Output heading, and both strings equal the script's exports

#### Scenario: The docs name the limits and carry the invocations
- **GIVEN** `docs/reference.md`, `docs/workflow.md`, and `skills/delivery/workflows/mr-review-to-ready.md`
- **WHEN** they are read
- **THEN** `docs/reference.md` contains both invocations exactly as exported, and each of the three says the memory is for one merge request, lives under `.review/`, and does not track fixed findings
