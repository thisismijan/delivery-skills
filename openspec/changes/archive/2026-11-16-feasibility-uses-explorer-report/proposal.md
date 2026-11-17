## Why

`/groom` already saves its codebase explorer's report, but `/draft`'s
feasibility analyst explored the same codebase again from scratch for every
ticket that came out of that grooming. That repeats work the run already paid
for. The report could not simply be reused, because nothing linked a work item
to its grooming folder and the report recorded no repository head, so nobody
could tell whether it was still current.

## What Changes

- `/groom` records `Repository head: <sha>` under each explorer session it
  appends, using a new read-only `explorer-context.ts head`.
- A new `explorer-context.ts find` locates the one grooming folder whose ticket
  draft has the work item's exact title. It reports the report as fresh when it
  was written at the current head, and as stale, with the files changed since,
  when the repository moved. A report with no recorded head, or one whose head
  is not in history, is stale with an unknown list. No match, or more than one,
  means no report.
- `/draft` runs it before dispatching the feasibility analyst and passes the
  result and the report. It never gives the report to the explain-back reader or
  the readiness reviewer.
- The feasibility analyst uses the report as a starting map, re-explores every
  changed file and anything the report does not cover, and checks every claim
  when the report's age is unknown. Its verdict format is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `groom-evidence-pushback`: the explorer report records the head it was
  written at and seeds feasibility in `/draft`.

## Impact

- New `factory/scripts/explorer-context.ts`
- `skills/groom/SKILL.md`, `skills/draft/SKILL.md`,
  `factory/agents/feasibility-analyst.md`, `docs/reference.md`
