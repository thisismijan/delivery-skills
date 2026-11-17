# delivery-ledger-writes

## Purpose

Makes every ledger mutation durable, generation-checked, and conflict-safe so concurrent writers cannot overwrite each other.

## Requirements

### Requirement: Concurrent writers cannot overwrite each other
Every ledger mutation SHALL go through the durable writer, which writes only when the ledger's current generation equals the generation the writer read, and increments it exactly once. A stale or contended write SHALL fail with a distinct concurrency conflict.

#### Scenario: Two writers read the same generation
- **WHEN** two writers read the same generation and both write
- **THEN** exactly one write succeeds
- **AND** the other stops with a concurrency conflict
- **AND** the ledger holds only the winning writer's content at the next generation

#### Scenario: A write is attempted while another holds the lock
- **WHEN** a lock is held by a live owner
- **THEN** the write stops with a concurrency conflict and the ledger is unchanged

### Requirement: Existing ledgers resume without conversion
The durable writer SHALL accept an existing valid ledger on first use, including one with no `Generation` header, which counts as generation 0.

#### Scenario: Legacy ledger without a generation header
- **WHEN** the durable writer first updates a ledger that has no `Generation` header
- **THEN** the write succeeds with the header stamped
- **AND** the ledger content is otherwise preserved
- **AND** a following write at the new generation succeeds

#### Scenario: Ledger in the current format
- **WHEN** the durable writer first updates a ledger that has a `Generation` header
- **THEN** the write succeeds with no manual conversion

### Requirement: Abandoned locks are recovered explicitly
A lock SHALL record its owner's process id, host, and timestamp. Recovery SHALL be an explicit step that clears a lock only when its owner is no longer active, and reports what it cleared. A write SHALL never clear a lock itself.

#### Scenario: Owner is no longer active
- **WHEN** a lock's recorded owner is no longer active and recovery is run
- **THEN** the lock is cleared and the recovery names the owner it cleared
- **AND** a following write succeeds

#### Scenario: Write meets an abandoned lock
- **WHEN** a write meets a lock whose owner is no longer active and recovery has not been run
- **THEN** the write stops with a concurrency conflict that points to recovery

#### Scenario: Owner is still active
- **WHEN** recovery is run against a lock whose owner is active, or whose host cannot be checked
- **THEN** the lock is left in place and recovery reports why

### Requirement: The workflows require the durable writer
The delivery ledger workflow SHALL name the durable writer and its explicit recovery step as the only way to mutate a ledger, and SHALL treat a concurrency conflict as a terminal stop.

#### Scenario: Workflow documents match the writer
- **WHEN** the delivery workflow documents are read
- **THEN** they name the writer and recovery commands that the store implements
- **AND** they state that a conflict is a terminal stop

### Requirement: Every new stop and approval line carries a UTC time
The durable ledger writer in `factory/scripts/ledger-store.ts` SHALL refuse a write that adds a stop line or an approval line without a UTC date and time. A stop line is any non-blank line in a Stops section of the ledger, and an approval line is any non-blank line in an Approvals section, so a line that is not a bullet, or that continues an earlier line, counts. Each line is compared and checked with its surrounding whitespace trimmed. A line SHALL begin with the bullet marker `- ` and then a time in the form `yyyy-mm-ddThh:mm:ssZ`, with a four digit year, a 24 hour clock, whole seconds, a literal `Z`, no offset or fraction, and a real calendar instant. The time SHALL be followed by a space or by the end of the line, so text joined straight onto the `Z` is refused. Each stop or approval entry SHALL be a single line. A line is new when it is not already present, as the same text, in the same kind of section of the ledger being replaced, counting repeats, so an older line carried over is not new. For the first write of a ledger, which has no ledger being replaced, every line is new. The check SHALL run after the generation checks, so a stale write still reports a concurrency conflict first, with exit 4. A refused write SHALL exit 1, leave the ledger file and its generation unchanged, create no file when it was a first write, release its lock, and print a plain language message that names the section, quotes the line, and shows the required form with an example. The form SHALL be defined once, in `factory/scripts/ledger-store.ts`, and every ledger write, including a worker journal write, SHALL be checked by it. The ledger format page `skills/delivery/workflows/delivery-ledger.md` SHALL state the form, and no other Markdown file under `skills/` SHALL carry its own copy.

#### Scenario: New stop and approval lines with a UTC time are written
- **GIVEN** a ledger whose Stops and Approvals sections each end with an older line
- **WHEN** the writer is run on an input that keeps the older lines and appends one stop line and one approval line that each begin `- 2026-11-09T13:34:05Z `
- **THEN** the writer exits 0, the ledger file holds the appended lines exactly as written, and its generation is one higher

#### Scenario: A new line with a date only is refused
- **GIVEN** a ledger that already holds older date-only lines in Stops and Approvals
- **WHEN** the writer is run on an input that keeps the older lines and appends a stop line, or separately an approval line, that begins `- 2026-11-09 ` and has no time
- **THEN** the writer exits 1, the message names the section, quotes the new line, and shows the form `yyyy-mm-ddThh:mm:ssZ` with an example, and the ledger file is byte for byte what it was before, with no lock left behind

#### Scenario: A time that is malformed or runs into the next text is refused
- **GIVEN** a ledger and an input that appends one new stop line
- **WHEN** the line begins `- 2026-11-09T13:34:05` (no `Z`), `- 2026-11-09T13:34:05+02:00` (an offset), `- 2026-11-09T13:34:05.000Z` (a fraction), `- 2026-11-09T13:34Z` (no seconds), `- 2026-13-45T25:00:00Z` (not a real instant), `- 2026-11-09T13:34:05Z5` or `- 2026-11-09T13:34:05Zabc` (text joined to the `Z`)
- **THEN** each input is refused with exit 1 and the same plain message, and the ledger file is unchanged, while a line that is `- 2026-11-09T13:34:05Z` and nothing after it is accepted

#### Scenario: A line that is not a single timed bullet is refused
- **GIVEN** a ledger and an input that appends one new line to Approvals
- **WHEN** the line is the bare text `continuous-delivery: yes`, or begins `* 2026-11-09T13:34:05Z `, or is indented continuation text under a timed bullet
- **THEN** each input is refused with exit 1 and the ledger file is unchanged, while the timed bullet on its own is accepted

#### Scenario: The first write of a ledger is checked and creates nothing when refused
- **GIVEN** a state root with no ledger for the id, and a first write at expected generation `-1`
- **WHEN** the input holds a stop line that begins `- 2026-11-09 ` with no time
- **THEN** the writer exits 1 and no ledger file exists afterwards, and the same input with a timed stop line writes the ledger

#### Scenario: A stale generation is reported before the time check
- **GIVEN** a ledger at generation 1 and an input written for generation 0 that also adds a date-only stop line
- **WHEN** the writer is run with expected generation 0
- **THEN** it exits 4 with the stale generation message, not exit 1 with the time message, and the ledger file is unchanged

#### Scenario: A worker journal write is checked the same way
- **GIVEN** `DELIVERY_WORKER_JOURNAL` names an absolute journal path
- **WHEN** the writer is run on an input that adds a date-only stop line, and then on an input that adds a stop line with a UTC time
- **THEN** the first is refused with exit 1 and the journal is unchanged, and the second is written

#### Scenario: Other sections keep their date-only form
- **GIVEN** a ledger and an input that appends a new Decisions line and a new Lessons line that begin with a date only
- **WHEN** the writer is run on it
- **THEN** the writer exits 0 and the lines are written as given

#### Scenario: The ledger format page names the form and no other skill file copies it
- **GIVEN** the form exported by `factory/scripts/ledger-store.ts` as `LEDGER_TIME_FORMAT`, with the value `yyyy-mm-ddThh:mm:ssZ`
- **WHEN** `skills/delivery/workflows/delivery-ledger.md` and every other Markdown file under `skills/` are read
- **THEN** the page's Stops and Approvals line templates each begin with a bullet marker and that exact text in angle brackets, its write rules say that Stops and Approvals entries are single lines that begin with a UTC time while other sections keep `yyyy-mm-dd`, and no other Markdown file under `skills/` contains that text

### Requirement: Older stop and approval lines are kept exactly and stay accepted
The durable ledger writer SHALL accept an update to a ledger whose existing stop and approval lines carry a date only, so long as every one of those lines is carried over as the same text. It SHALL NOT require the older lines to gain a time and SHALL NOT report them. It SHALL refuse a write in which any older line of a Stops or Approvals section of the ledger being replaced, compared with whitespace trimmed per line and counting repeats, is missing from the same kind of section in the new ledger, so an edited, dropped, or backfilled older line is refused. The refusal SHALL exit 1, leave the ledger unchanged, and say that older lines are kept exactly as written and new lines start with a UTC time. This includes a ledger with no `Generation` header, whose first write is stamped as before.

#### Scenario: A date-only ledger is updated and its older lines are untouched
- **GIVEN** the fixture `factory/scripts/fixtures/ledger-date-only.md` (new), an older ledger with no `Generation` header and with date-only lines in Stops and Approvals
- **WHEN** the writer is run on an input made from that fixture with an unrelated Decisions line appended
- **THEN** the writer exits 0, the generation is stamped, and every older stop and approval line in the written ledger is the same text as in the fixture

#### Scenario: An edited, backfilled, or dropped older line is refused
- **GIVEN** the date-only fixture ledger
- **WHEN** the writer is run on an input in which an older stop line has its wording changed, or has a made-up UTC time added in front of its date, or is removed, or in which one of two identical older approval lines is removed
- **THEN** each input is refused with exit 1, the message quotes the missing older line and says older lines are kept exactly as written and new lines start with a UTC time, and the ledger file is unchanged

### Requirement: The Stops and Approvals sections are found reliably
The durable ledger writer SHALL recognise a Stops or Approvals section by a line whose text, with surrounding whitespace and carriage returns trimmed and letter case ignored, is `## Stops` or `## Approvals`. The section runs to the next line that begins `## `. It SHALL check every occurrence of such a heading, treating the lines of all occurrences of one kind as one section. It SHALL refuse a write whose ledger being replaced has a Stops or Approvals section and whose new ledger has none of that kind, with exit 1 and the ledger unchanged.

#### Scenario: Heading variants and a second heading are all checked
- **GIVEN** a ledger written with Windows line endings and the heading `## stops ` with a trailing space, and a second `## Stops` heading further down
- **WHEN** the writer is run on an input that adds a date-only stop line under the first heading, or separately under the second
- **THEN** each input is refused with exit 1 and the ledger file is unchanged

#### Scenario: A dropped or renamed section is refused
- **GIVEN** a ledger with Stops and Approvals sections
- **WHEN** the writer is run on an input that has no Approvals heading, or that renames `## Stops` to `### Stops`, and that adds a date-only stop line
- **THEN** each input is refused with exit 1, the message names the missing section, and the ledger file is unchanged
