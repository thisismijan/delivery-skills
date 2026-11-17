## 1. Tests

- [x] 1.1 The latest session's recorded head is read, and a latest session without one has none.
- [x] 1.2 A fresh report, a stale report with its changed files, a report with no or an unknown head, no match, and two matches each give the right context.
- [x] 1.3 The commands print the head and the context, and refuse a work item with no title.
- [x] 1.4 Groom stamps the head, draft passes the report to feasibility only, and the analyst re-explores changes.

## 2. Implementation

- [x] 2.1 Add `explorer-context.ts`.
- [x] 2.2 Stamp the head in `/groom` and pass the context in `/draft`.
- [x] 2.3 Teach the feasibility analyst to use the report as a starting map.
