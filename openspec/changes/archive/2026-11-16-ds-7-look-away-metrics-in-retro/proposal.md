## Why

The operator decides how much to supervise, and how many tickets to run at once, by feel. Retro reports nothing measured that would show whether agents can safely run longer without a person. The previous slice (DS-6) put a UTC time on every new Stops and Approvals line in the run ledger, so the interruption record can now be measured. This change measures it and says what it shows.

## What Changes

- A new deterministic script, `factory/scripts/look-away-metrics.ts`, reads one run's ledger and that run's worker dispatch records, and prints one report. It writes nothing, reads no clock, and calls no model
- The report gives the most tickets executing at once, from the dispatch records under the state root. When the records are missing or cannot be read (including a ticket dispatched twice), the peak is unknown. A worker with no finish time counts as still running, and the peak is then reported as at least that many. That figure is never enough to suggest a raise
- The report gives the number of operator stops by stage. Every line in the Stops section of the run ledger and of every worker journal counts, including older date-only ones, because a fan-out's workers record their stops only in their own journals. A journal that cannot be read is named, and makes the stretch unknown and the suggestion hold. A worker the coordinator stopped for being idle is named, is not an operator stop, and holds the suggestion. A line whose stage cannot be read is listed and counted as unreadable, not dropped
- The report gives the longest stretch without an operator interrupt, in hours and minutes. Every Stops line and every Approvals line that carries a UTC time is an interrupt. The stretch is measured only between two consecutive timed interrupts, across the ledger and the journals together, and it includes time spent waiting for a person, which the report says. With fewer than two timed interrupts, or when an older line with no time could have fallen inside every gap, the stretch is unknown. It is never estimated from a date-only line, and never measured from the run's start or end
- The report suggests raising concurrency only when the peak is exact and has reached the limit the run used, that limit equals the configured limit, and the longest stretch is known and at least four hours. Otherwise it suggests holding. The limit the run used is read from the run ledger's recorded level line, not from the retro shell. It names both limits and the reason, and it never changes a setting
- The report covers the whole run, and a retro scoped to one ticket shows it the same way
- Retro gains a step that runs the script and presents the numbers in plain words, with the suggestion
- The ledger writer's module exports two small existing pieces, so the script reuses the writer's own reading of the Stops and Approvals sections and of a timed line instead of copying them. The writer's behaviour does not change

## Capabilities

### New Capabilities

- `look-away-metrics`: the measured supervision numbers a retro reports (peak concurrency, operator stops by stage, longest stretch without an interrupt) and the read-only raise-or-hold suggestion drawn from them

### Modified Capabilities

None. `delivery-ledger-writes` is not changed: its two shared readers are exported and reused, and the writer refuses and accepts exactly what it did before.

## Out of Scope

- Changing the concurrency setting, or any other setting, automatically
- Adding times to the ledger (DS-6 did that for new lines)
- Estimating a stretch from a date-only line
- Measuring a stretch from run start or run end, which carry no UTC time
- Using worker journals for the peak (they are read only for stops and approvals): the dispatch records are the one source of when a worker ran
- Counting the coordinator's stop of an idle worker as an operator stop or interrupt: it is an automatic stop recorded in Decisions, not a person's interruption. It is named and holds the suggestion instead
- Separating time spent waiting for a person, quiet-hour waits, or operator decisions recorded only in Decisions from the stretch: the ledger carries no time for when a wait began or ended and Decisions lines have no fixed shape, so subtracting them would be a guess. The report states that the stretch includes waiting
- Changing how auto records a re-dispatched ticket or a worker's finish time: the report treats a duplicate key as unknown and a missing finish time as at least
- Recording the metrics or the suggestion in the ledger, or creating a work item from them
- Rewriting or backfilling older ledgers

## Impact

- `factory/scripts/look-away-metrics.ts` (new) holds the pure calculations and the command line. It reuses `WorkerDispatch` from `factory/scripts/worker-watch.ts`, the time check `isLedgerTime` from `factory/scripts/ledger-store.ts`, and `loadConfig` from `factory/scripts/config.ts` for the limit configured now
- `factory/scripts/ledger-store.ts` exports `ledgerEntryLines` (the existing section reader, by section name: Stops, Approvals, or Decisions) and `ledgerLineTime` (the existing timed-bullet check, which the writer's own check now calls). No change in what the writer accepts or refuses
- `skills/delivery/workflows/retro.md` gains the measurement step and its presentation rules; the Present step is renumbered
- `factory/scripts/look-away-metrics.test.ts` (new) covers the calculations and the command line; `factory/scripts/ledger-store.test.ts` covers the two exports
- `factory/scripts/fixtures/look-away-ledger.md`, `look-away-dispatch.json`, `look-away-journal.md`, and `ledger-real-stops.md` (all new) are the sample inputs
- `skills/delivery/checks/delivery-specs.test.ts` gains assertions that retro names the script's command as exported by its source and states the presentation and never-change rules
- `docs/reference.md` lists the script's command beside the other factory scripts
