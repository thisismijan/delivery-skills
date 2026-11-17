## ADDED Requirements

### Requirement: A deterministic script computes the look-away numbers and writes nothing
The factory SHALL provide `factory/scripts/look-away-metrics.ts`, run as `scripts/look-away-metrics.ts <state-root> <run-id>`. It SHALL read the run ledger at `<state-root>/<run-id>.md`, the worker dispatch records at `<state-root>/workers/<run-id>/dispatch.json`, and the worker journals `<state-root>/workers/<run-id>/<key>.md`, and nothing else: no tracker, no forge, no model, and no clock. In a fan-out the coordinator is the only writer of the run ledger and never copies a worker's stops or approvals into it, so those live only in the journals. It SHALL print one report as JSON on standard output and exit 0. The same ledger, dispatch records, and configuration SHALL always give the same report, byte for byte. The report SHALL hold these parts: the peak number of tickets executing at once, the operator stops by stage, the workers the coordinator stopped for being idle, the longest stretch without an operator interrupt, which journals were read and any that could not be, and the concurrency suggestion with the limit the run used and the limit configured now. The script SHALL NOT write, create, move, or delete any file, and SHALL NOT change any setting. When the ledger is missing or unreadable, or the configuration is invalid, it SHALL exit 1 with a plain message on standard error naming the problem and print no report. A dispatch record that is missing or unusable SHALL NOT stop the report: it makes the peak unknown and leaves the other parts as they were. A journal directory that does not exist is a run that never fanned out, and SHALL NOT be a problem. The command SHALL be defined once, in `factory/scripts/look-away-metrics.ts`, and the retro workflow SHALL name it from there.

#### Scenario: The same inputs give the same report
- **GIVEN** the fixture ledger `factory/scripts/fixtures/look-away-ledger.md` (new), the dispatch records `factory/scripts/fixtures/look-away-dispatch.json` (new), and the journal `factory/scripts/fixtures/look-away-journal.md` (new), placed under a temporary state root as `<run-id>.md`, `workers/<run-id>/dispatch.json`, and `workers/<run-id>/DS-2.md`
- **WHEN** the script is run twice, with a fixed configuration and no other change between the runs
- **THEN** both runs exit 0 and print the same bytes, and the report does not change when the dispatch records hold finish times far in the past or far in the future of the machine's clock

#### Scenario: The script leaves the state root and the settings untouched
- **GIVEN** a temporary state root holding the ledger and the dispatch records, and a settings file beside it
- **WHEN** the script is run, including with a configuration that makes the suggestion raise
- **THEN** every file under the state root and the settings file is byte for byte what it was, no file or lock directory has appeared, and the script's source imports no file-writing function

#### Scenario: A missing ledger or an invalid configuration is a plain failure
- **GIVEN** a state root with no ledger for the run id, or a valid ledger and `MAX_PARALLEL_WORKTREES` set to `0`
- **WHEN** the script is run
- **THEN** it exits 1, standard output is empty, and standard error names the missing ledger path or the invalid setting in plain language

#### Scenario: A run that never fanned out has no journals and is not a failure
- **GIVEN** a state root with a ledger and no `workers/<run-id>` folder
- **WHEN** the script is run
- **THEN** it exits 0, the stops and the stretch come from the ledger alone, the peak is unknown because the dispatch records are missing, and no journal is reported as unreadable

#### Scenario: A usage mistake exits 2
- **GIVEN** the script run with fewer than two arguments
- **WHEN** it starts
- **THEN** it exits 2 and prints its usage line, naming the command as exported by its own source

### Requirement: The peak number of tickets executing at once comes from the dispatch records
The look-away report SHALL give the most tickets executing at once, taken from `workers/<run-id>/dispatch.json` under the state root. Each worker is running from its `dispatchedAt` until its `finishedAt`. A worker that has a `finishedAt` is not running at that instant, so a worker that finishes at the instant another is dispatched does not overlap it. A worker that has no `finishedAt` counts as still running with no end, the same way the wave selector counts it against the limit, and when any worker has no `finishedAt` the peak SHALL be reported as at least that number, not as an exact one. A missing `finishedAt` read after the run is over usually means the coordinator never recorded it, not that the worker was still running, so an at least peak is an upper estimate that may overstate the real overlap, and the suggestion SHALL NOT treat it as reaching the limit. The peak is at least 1 when there is at least one worker. When the dispatch records are missing, the peak SHALL be reported as unknown, with a plain reason. When they are present but do not parse as the worker dispatch schema, including a key that appears twice because a worker was dispatched again, or a worker's `finishedAt` is earlier than its `dispatchedAt`, the peak SHALL also be unknown, with a plain reason, and SHALL NOT be guessed. The records cover every wave of the run, so the peak is the largest overlap at any instant across all waves. Worker journals SHALL NOT be used for the peak.

#### Scenario: Overlapping workers give the largest overlap
- **GIVEN** dispatch records for three workers: A from 10:00 to 12:00, B from 11:00 to 13:00, and C from 11:30 to 11:45, all finished
- **WHEN** the report is computed
- **THEN** the peak is exactly 3, not reported as at least

#### Scenario: Back-to-back workers do not overlap
- **GIVEN** dispatch records for A from 10:00 to 11:00 and B from 11:00 to 12:00
- **WHEN** the report is computed
- **THEN** the peak is exactly 1

#### Scenario: A worker with no finish time makes the peak at least
- **GIVEN** worker A dispatched at 10:00 with no finish time, and worker B from 11:00 to 12:00
- **WHEN** the report is computed
- **THEN** the peak is reported as at least 2

#### Scenario: A single unfinished worker is at least one
- **GIVEN** dispatch records holding one worker with no finish time
- **WHEN** the report is computed
- **THEN** the peak is reported as at least 1

#### Scenario: Several waves in one record file are one run
- **GIVEN** a first wave of two workers finished by 12:00 and a second wave of three workers dispatched at 13:00, all finished
- **WHEN** the report is computed
- **THEN** the peak is exactly 3, the largest overlap in any wave, not the 5 workers in total

#### Scenario: Missing dispatch records make the peak unknown and nothing else
- **GIVEN** a ledger with stops and approvals and no `workers/<run-id>/dispatch.json`
- **WHEN** the report is computed
- **THEN** the peak is reported as unknown with a reason that the dispatch records were not found, and the stops by stage and the longest stretch are reported as the ledger gives them

#### Scenario: Unusable dispatch records make the peak unknown
- **GIVEN** dispatch records that are not valid JSON, or that fail the worker dispatch schema, or in which a worker finishes before it was dispatched
- **WHEN** the report is computed
- **THEN** each case reports the peak as unknown with a plain reason, exits 0, and reports the other parts as usual

#### Scenario: A key dispatched again makes the peak unknown
- **GIVEN** dispatch records in which the key DS-2 appears twice, a first dispatch that finished and a later dispatch of the same key
- **WHEN** the report is computed
- **THEN** the peak is reported as unknown with a plain reason that a key appears twice, the first interval is not dropped to make the file fit, and the other parts are reported as usual

### Requirement: Operator stops are counted by stage, and every Stops line counts, in the ledger and in the worker journals
The look-away report SHALL give the number of operator stops by stage. Every non-blank line in the Stops section of the run ledger, and of every worker journal `<state-root>/workers/<run-id>/<key>.md`, SHALL count as one stop, including older lines that carry a date and no time. The Stops section is found the way the durable ledger writer finds it: a heading whose text, with surrounding whitespace trimmed and letter case ignored, is `## Stops`, every occurrence of such a heading read as one section, running to the next line that begins `## `. A stop line is read as a bullet `- `, then either a UTC time written `yyyy-mm-ddThh:mm:ssZ` or a date written `yyyy-mm-dd`, then a key, then a stage. The key is a work-item key or the word `run`. The stage is the word after the key, and stages are grouped without regard to letter case. The separator after the stage SHALL NOT be required to be any particular dash. A stop line that cannot be read this way SHALL be counted in the total, listed in full under unreadable lines, and left out of every stage. The total SHALL equal the stage counts plus the unreadable lines. Approvals lines, and lines in any other section, SHALL NOT be counted as stops. A worker journal that exists but cannot be read SHALL be listed by file name as unreadable, its stops are then unknown, and the report SHALL say the stop counts and the stretch are incomplete: the stretch SHALL be unknown and the suggestion SHALL be hold. The coordinator's own stop of an idle worker is recorded as a line in the Decisions section, `worker <KEY> idle for <N> minutes; stopped`, not as a Stops line. It is an automatic stop by the coordinator, not an operator stop or an operator interrupt, so it is not counted as either. The report SHALL name each worker stopped that way, read from the Decisions section found the way the Stops section is.

#### Scenario: Stops are counted by stage across timed and date-only lines
- **GIVEN** the fixture ledger with Stops lines `- 2026-11-02 DS-1 execute — …`, `- 2026-11-09T13:40:12Z DS-2 draft — …`, `- 2026-11-10T09:00:00Z DS-3 execute — …`, and `- 2026-11-10T15:00:00Z DS-3 review — …`
- **WHEN** the report is computed
- **THEN** it reports 4 stops in total, 2 at execute, 1 at draft, 1 at review, and no unreadable lines

#### Scenario: Real ledger line shapes are read
- **GIVEN** the fixture `factory/scripts/fixtures/ledger-real-stops.md` (new), the Stops section of a real run ledger, whose lines use a plain hyphen after the stage, the key `run`, and a blank line between entries
- **WHEN** the report is computed
- **THEN** it reports 3 stops in total, 1 at groom, 1 at auto, 1 at draft, and no unreadable lines

#### Scenario: A line that cannot be read is surfaced, not dropped
- **GIVEN** a Stops section with one readable line and the lines `- 2026-11-10T09:00:00Z waiting on the vendor`, `continuous-delivery: yes`, and `* 2026-11-10 DS-4 execute — stopped`
- **WHEN** the report is computed
- **THEN** the total is 4, the one readable line is counted at its stage, and the other three are listed in full as unreadable and counted at no stage

#### Scenario: Only the Stops section counts
- **GIVEN** a ledger whose Approvals, Decisions, and Lessons sections hold lines that name a stage, and a Stops section with a heading `## stops ` written with a trailing space and Windows line endings, and a second `## Stops` heading further down
- **WHEN** the report is computed
- **THEN** only the lines under the two Stops headings are counted, and the second heading's lines are included

#### Scenario: Stops that live only in a worker journal are counted
- **GIVEN** the fixture ledger with 1 Stops line at execute, and the journal `workers/<run-id>/DS-2.md` holding 2 Stops lines at execute and review that the ledger does not contain
- **WHEN** the report is computed
- **THEN** it reports 3 stops in total, 2 at execute and 1 at review, and the report says one journal was read

#### Scenario: A journal that cannot be read makes the counts incomplete
- **GIVEN** a ledger with timed stops, and a journal `workers/<run-id>/DS-3.md` that cannot be read as text, as when the path is a directory
- **WHEN** the report is computed
- **THEN** the journal is listed by name as unreadable, the report says the stop counts are incomplete, the stretch is reported as unknown with a reason that a journal could not be read, and the suggestion is hold

#### Scenario: An idle worker stop is named and is not an operator stop
- **GIVEN** a Decisions line `- 2026-11-10T11:00:00Z run - worker DS-2 idle for 25 minutes; stopped` and a Stops section with 2 lines
- **WHEN** the report is computed
- **THEN** the stops total is 2, DS-2 is named as a worker stopped for being idle, and the line is neither counted as a stop nor used as an interrupt

#### Scenario: A ledger with no stops reports none
- **GIVEN** a ledger with an empty Stops section, or with no Stops section
- **WHEN** the report is computed
- **THEN** the total is 0 and no stage or unreadable line is listed

### Requirement: The longest stretch without an operator interrupt is measured only between timed interrupts
The look-away report SHALL give the longest stretch without an operator interrupt, in hours and minutes. An interrupt is every line of the Stops section and every line of the Approvals section, of the run ledger and of every worker journal, that begins `- ` and then a UTC time written `yyyy-mm-ddThh:mm:ssZ` that the durable ledger writer's own time check accepts. The Approvals section is found the same way as the Stops section. The stretch SHALL be measured only between two consecutive timed interrupts, taken in time order across both sections and across the ledger and every journal together, and the longest such stretch is reported with the two interrupts that bound it. Minutes are whole minutes, rounded down, and the report SHALL carry the exact length in seconds for the suggestion to compare, so a stretch that shows as `3h 59m` is still under four hours. With fewer than two timed interrupts the stretch SHALL be reported as unknown. A Stops or Approvals line with no UTC time is not a timed interrupt, and the stretch SHALL NOT be estimated from it, nor from the run's creation date, nor measured from the start or end of the run. Because an older line with no time still happened somewhere, a gap between two consecutive timed interrupts SHALL be left out of the comparison when an untimed line whose date falls on a UTC day that overlaps the gap could have split it, and a Stops or Approvals line with neither a UTC time nor a readable date could have split every gap. When every gap is left out, the stretch SHALL be reported as unknown, with a plain reason. The untimed-line rule applies to untimed lines in a journal as it does to those in the ledger. The stretch is wall-clock time between two interrupts. It includes any time the run sat waiting for a person, overnight waits, and operator decisions recorded only in Decisions, none of which the ledger times, so a long stretch can come from waiting and not from unsupervised work. The report SHALL say in plain words that the stretch includes waiting, and SHALL NOT claim otherwise or try to subtract waiting.

#### Scenario: The longest gap between consecutive timed interrupts is reported
- **GIVEN** timed interrupts, a stop at `2026-11-10T09:00:00Z`, an approval at `2026-11-10T10:30:00Z`, a stop at `2026-11-10T15:45:00Z`, and an approval at `2026-11-10T16:00:00Z`
- **WHEN** the report is computed
- **THEN** the longest stretch is `5h 15m`, bounded by the approval at 10:30 and the stop at 15:45, and the other stretches (`1h 30m`, `0h 15m`) are not reported as the longest

#### Scenario: Stops in a worker journal split a gap the ledger alone would show
- **GIVEN** a ledger whose only timed interrupts are at `2026-11-10T09:00:00Z` and `2026-11-10T17:00:00Z`, and a journal holding a timed stop at `2026-11-10T13:00:00Z`
- **WHEN** the report is computed
- **THEN** the longest stretch is `4h 0m`, bounded by 09:00 and 13:00 or by 13:00 and 17:00, and not `8h 0m`

#### Scenario: A stretch is reported as including waiting
- **GIVEN** two timed interrupts 9 hours apart with a Decisions line between them, `- 2026-11-10T13:00:00Z run - operator chose option A`
- **WHEN** the report is computed
- **THEN** the longest stretch is `9h 0m`, the Decisions line does not split it, and the report carries a plain statement that the stretch includes time spent waiting for a person

#### Scenario: Stops and approvals are ordered by time across sections
- **GIVEN** a ledger whose Stops section holds the timed lines at 09:00 and 15:00, and whose Approvals section holds a timed line at 12:00 that appears earlier in the file than the Stops section
- **WHEN** the report is computed
- **THEN** the longest stretch is `3h 0m`, measured between 09:00 and 12:00 or 12:00 and 15:00, and not `6h 0m` from reading the Stops section alone

#### Scenario: Fewer than two timed interrupts is unknown
- **GIVEN** a ledger with no timed Stops or Approvals line, or with exactly one
- **WHEN** the report is computed
- **THEN** the longest stretch is reported as unknown, with a plain reason that at least two timed interrupts are needed

#### Scenario: A date-only ledger is never estimated
- **GIVEN** the older fixture `factory/scripts/fixtures/ledger-date-only.md`, whose Stops and Approvals lines carry a date only, and a `Created:` date
- **WHEN** the report is computed
- **THEN** the longest stretch is reported as unknown, and a ledger with one timed line added to it is still unknown

#### Scenario: A date-only line that could split a gap hides that gap
- **GIVEN** timed interrupts at `2026-11-09T09:00:00Z`, `2026-11-10T18:00:00Z`, and `2026-11-10T20:00:00Z`, and a date-only stop line dated `2026-11-09`
- **WHEN** the report is computed
- **THEN** the gap from 2026-11-09 09:00 to 2026-11-10 18:00 is left out because the date-only line could fall inside it, and the longest stretch reported is the `2h 0m` between the last two interrupts

#### Scenario: A date-only line outside every gap hides nothing
- **GIVEN** timed interrupts at `2026-11-10T09:00:00Z` and `2026-11-10T17:00:00Z`, and a date-only stop line dated `2026-11-02`
- **WHEN** the report is computed
- **THEN** the longest stretch is `8h 0m`

#### Scenario: Every gap hidden means unknown
- **GIVEN** two timed interrupts at `2026-11-10T09:00:00Z` and `2026-11-10T17:00:00Z`, and a date-only approval dated `2026-11-10`, or separately a stop line with neither a time nor a readable date
- **WHEN** the report is computed
- **THEN** the longest stretch is reported as unknown, with a plain reason that an older line with no time could have fallen inside

#### Scenario: The display rounds down and the exact length is kept
- **GIVEN** two consecutive timed interrupts 3 hours 59 minutes 59 seconds apart, and a second ledger with two interrupts exactly 4 hours apart
- **WHEN** the report is computed
- **THEN** the first reports `3h 59m` with an exact length of 14399 seconds, and the second reports `4h 0m` with an exact length of 14400 seconds

#### Scenario: The writer's own time check decides what is timed
- **GIVEN** lines that begin `- 2026-11-10T09:00:00Z `, `- 2026-11-10T09:00:00Zabc`, `- 2026-11-10T09:00:00.000Z`, `- 2026-13-45T25:00:00Z`, and `* 2026-11-10T09:00:00Z `
- **WHEN** the line check exported by `factory/scripts/ledger-store.ts` as `ledgerLineTime` is applied to each, and the report is computed over a ledger holding them
- **THEN** only the first yields a time and counts as a timed interrupt, and the durable ledger writer accepts and refuses exactly the lines it did before this change

### Requirement: The concurrency suggestion is raise only on measured evidence, otherwise hold, and never applied
The look-away report SHALL carry a suggestion that is either raise or hold, the limit the run used, the limit configured now, and plain reasons. The limit the run used is read from the run ledger's Decisions section, from lines of the form `level <level>: maxParallelWorktrees=<n> ...` that auto records at its start with the run's effective values, including any `MAX_PARALLEL_WORKTREES` override. A line whose value is not a positive whole number is not usable. When several usable lines exist, the highest value is the limit the run used, because a higher limit is harder to reach. When no usable line exists, the limit the run used is unknown. The limit configured now is `maxParallelWorktrees` from the factory configuration (`MAX_PARALLEL_WORKTREES` and `DELIVERY_LEVEL` of the process running the script), read only. The suggestion SHALL be raise only when all of these hold: the peak is exact, not at least, and is not below the limit the run used; the limit the run used is known and equals the limit configured now; the longest stretch is known and its exact length is at least four hours (14400 seconds); no worker journal was unreadable; and no worker was stopped for being idle. In every other case the suggestion SHALL be hold, including when the peak is unknown or at least, below the limit the run used, or when the stretch is unknown or shorter than four hours. The reasons SHALL say in plain words which condition held or failed, and a raise reason SHALL say the stretch counts time spent waiting. The script and the retro workflow SHALL NOT change any setting, environment variable, or configuration file, and SHALL NOT create a work item, whichever way the suggestion points. The suggestion is advice, and applying it is the operator's own change through the normal process.

#### Scenario: Raise when the peak reached the limit and the stretch is four hours
- **GIVEN** a run limit of 4 equal to the configured limit of 4, an exact peak of 4, a longest stretch of exactly 4 hours, no unreadable journal, and no idle worker
- **WHEN** the suggestion is computed
- **THEN** it is raise, it shows the limit the run used and the limit configured now as 4, and its reasons say the peak reached the limit, the longest stretch was at least four hours, and that stretch counts time spent waiting

#### Scenario: Hold when the peak is below the limit
- **GIVEN** a run limit of 4 equal to the configured limit of 4, an exact peak of 3, and a longest stretch of 10 hours
- **WHEN** the suggestion is computed
- **THEN** it is hold, and a reason says the peak did not reach the limit

#### Scenario: Hold when the stretch is under four hours or unknown
- **GIVEN** a run limit of 4 equal to the configured limit of 4, an exact peak of 4, and a longest stretch of 3 hours 59 minutes 59 seconds, or separately a longest stretch that is unknown
- **WHEN** the suggestion is computed
- **THEN** each case is hold and a reason names the stretch as too short or unknown

#### Scenario: An unknown peak is a hold
- **GIVEN** a longest stretch of 9 hours and a peak that is unknown
- **WHEN** the suggestion is computed
- **THEN** it is hold and a reason says the peak is unknown

#### Scenario: An at least peak never raises
- **GIVEN** a run limit of 4 equal to the configured limit of 4, a longest stretch of 5 hours, and a peak of at least 4, or separately a peak of at least 6
- **WHEN** the suggestion is computed
- **THEN** both are hold, and a reason says the peak was not confirmed because a worker has no finish time recorded

#### Scenario: A peak above the run limit counts as reached when it is exact
- **GIVEN** a run limit of 4 equal to the configured limit of 4, a longest stretch of 5 hours, and an exact peak of 6, as when the limit was lowered mid-run
- **WHEN** the suggestion is computed
- **THEN** it is raise

#### Scenario: The limit the run used is read from the ledger, not from the shell
- **GIVEN** a ledger whose Decisions section holds `- 2026-11-09T13:34:05Z run - level max: maxParallelWorktrees=8 maxFixAttempts=2 maxReviewRounds=3 - config.ts`, an exact peak of 4, a longest stretch of 6 hours, and the script run with no `DELIVERY_LEVEL` and `MAX_PARALLEL_WORKTREES` unset, so the configured limit is 4
- **WHEN** the script is run
- **THEN** the report shows 8 as the limit the run used and 4 as the limit configured now, and the suggestion is hold with a reason that the peak did not reach the limit the run used

#### Scenario: An override recorded for the run is the limit it used
- **GIVEN** a ledger whose Decisions section holds `level standard: maxParallelWorktrees=2 ...`, an exact peak of 2, a longest stretch of 5 hours, and `MAX_PARALLEL_WORKTREES` set to `2` for the script
- **WHEN** the script is run
- **THEN** the report shows 2 as the limit the run used and 2 as the limit configured now, and the suggestion is raise

#### Scenario: A limit that changed since the run holds
- **GIVEN** a run limit of 4 recorded in the ledger, an exact peak of 4, a longest stretch of 5 hours, and a configured limit of 8
- **WHEN** the suggestion is computed
- **THEN** it is hold, and a reason names both limits and says they differ

#### Scenario: No recorded limit is unknown and holds
- **GIVEN** a ledger with no `level ...: maxParallelWorktrees=...` line in Decisions, or only a line whose value is `0` or `many`, an exact peak of 4, and a longest stretch of 5 hours
- **WHEN** the script is run
- **THEN** the limit the run used is reported as unknown, the limit configured now is still shown, and the suggestion is hold with a reason that the limit the run used is unknown

#### Scenario: Several recorded limits use the highest
- **GIVEN** a ledger whose Decisions section holds `level standard: maxParallelWorktrees=4 ...` and later `level max: maxParallelWorktrees=8 ...`, and an exact peak of 4
- **WHEN** the script is run
- **THEN** the limit the run used is 8 and the suggestion is hold

#### Scenario: An idle worker stop holds the suggestion
- **GIVEN** every condition for raise, and a Decisions line `worker DS-2 idle for 25 minutes; stopped`
- **WHEN** the suggestion is computed
- **THEN** it is hold, and a reason says a worker was stopped for being idle

#### Scenario: No setting changes whichever way the suggestion points
- **GIVEN** a run that produces raise and a run that produces hold, each under a temporary state root with a settings file and the process environment recorded beforehand
- **WHEN** the script is run on each
- **THEN** the settings file, every file under the state root, and the environment values `MAX_PARALLEL_WORKTREES` and `DELIVERY_LEVEL` are unchanged afterwards

### Requirement: Retro runs the script and presents the whole-run report in plain words
The retro workflow `skills/delivery/workflows/retro.md` SHALL have a step that runs the look-away script on the ledger it found, passing the state root and the run id taken from that ledger's location, and presents the report before it lists proposals. The command SHALL be the one `factory/scripts/look-away-metrics.ts` exports, not a copy typed into the page. The presentation SHALL use plain words and no raw field names: the most tickets executing at once (or that the peak is unknown, or at least N), the operator stops by stage with any unreadable lines and unreadable journals named, any workers stopped for being idle, the longest stretch without an interrupt in hours and minutes (or unknown, with the reason) with the plain statement that it includes time spent waiting for a person, the suggestion of raise or hold with the limit the run used, the limit configured now, and the reason. The report SHALL cover the whole run and SHALL be presented the same way when the retro is scoped to a single ticket, saying that the figures are for the whole run. When the script fails, retro SHALL say in plain words that the figures could not be measured and why, SHALL NOT invent or estimate any figure, and SHALL continue with the rest of the retro. Retro SHALL state that it changes no setting and creates no work item for the suggestion, in both single-step and continuous modes, and SHALL NOT add a checkpoint for it.

#### Scenario: Retro names the script's command from its source
- **GIVEN** the command exported by `factory/scripts/look-away-metrics.ts`
- **WHEN** `skills/delivery/workflows/retro.md` is read
- **THEN** it contains that command exactly, in a step that comes before the Present step, and that step says the state root and run id come from the ledger it found

#### Scenario: Retro presents each number in plain words
- **GIVEN** the retro workflow text
- **WHEN** its measurement step is read
- **THEN** it says to present the most tickets executing at once, the operator stops by stage, the longest stretch in hours and minutes and that it includes waiting, and the suggestion with the limit the run used and the limit configured now, and it names the non-numeric outcomes: unknown, at least N, unreadable lines, and unreadable journals; and it does not tell the model to print field names of the report

#### Scenario: The report is whole-run even for a single ticket
- **GIVEN** the retro workflow text
- **WHEN** its measurement step is read
- **THEN** it says the figures cover the whole run, that a retro scoped to one ticket shows them the same way, and that it says so when presenting

#### Scenario: A failing script does not stop the retro or produce a guess
- **GIVEN** the retro workflow text
- **WHEN** its measurement step is read
- **THEN** it says that when the script fails the retro reports the figures as not measured with the script's message, estimates nothing, and goes on

#### Scenario: Retro never applies the suggestion
- **GIVEN** the retro workflow text
- **WHEN** its measurement step and its Never section are read
- **THEN** they say retro changes no setting, creates no work item for the suggestion, and adds no checkpoint, in both single-step and continuous modes, and the existing Never rules are all still present
