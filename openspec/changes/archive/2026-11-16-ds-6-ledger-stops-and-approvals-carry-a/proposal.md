## Why

Stop and approval lines in the run ledger carry a date and no time of day. Without a time, nobody can measure how long agents ran between operator interrupts, and a later retro cannot say whether supervision can safely be relaxed. Every stage that records a stop or an approval already writes it through one place, the durable ledger writer, so that is the one place that can both define the time format and refuse a line that lacks it.

## What Changes

- A stop line or an approval line that a write adds to the run ledger must begin with a UTC date and time in the form `yyyy-mm-ddThh:mm:ssZ`, for example `2026-11-09T13:34:05Z`
- The durable ledger writer checks this on every write and refuses a new stop or approval line that has a date only, or a time that is not a real UTC instant in that form. The refusal is a failure, not a warning: the writer exits 1 with a plain message that names the section and the line, and the ledger is left unchanged
- A line is new when it is not already in the ledger being replaced. Older ledgers whose stop and approval lines carry a date only are accepted unchanged, because their lines are already in the ledger and are not checked again
- The writer also refuses a write that edits, drops, or backfills an older stop or approval line, or that loses the Stops or Approvals section, so the append-only rule holds and no made-up time can be added to an old line
- Section headings are matched without regard to letter case or surrounding whitespace, and every occurrence is checked
- The ledger format page states the time form in the Stops and Approvals line templates and in the write rules, so every stage reads it where it already reads the ledger rules
- Decisions, Lessons, Verdicts, and the other ledger sections keep their date-only form

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `delivery-ledger-writes`: gains three requirements: the UTC time on every new stop and approval line, older date-only lines kept exactly and accepted, and reliable recognition of the two sections. The existing requirements are not changed

## Out of Scope

- Rewriting or backfilling older ledgers
- Adding times to any other ledger section
- Computing or reporting supervision metrics
- Changing any stage workflow's own wording about when it writes a stop or an approval
- A separate lint command: the writer is the single check

## Impact

- `factory/scripts/ledger-store.ts` defines the time form and the check, and calls the check from `writeLedger`
- `skills/delivery/workflows/delivery-ledger.md` states the time form and the single line rule in the Stops and Approvals line templates and the write rules
- `factory/scripts/fixtures/ledger-date-only.md` (new) is an older ledger with date-only stop and approval lines and no `Generation` header
- `factory/scripts/ledger-store.test.ts` covers the writer scenarios on that fixture, through the command line and the exported functions `isLedgerTime` and `ledgerEntryProblems`
- `skills/delivery/checks/delivery-specs.test.ts` gains an assertion that the ledger format page names the time form the writer exports and that no other Markdown file under `skills/` copies it
