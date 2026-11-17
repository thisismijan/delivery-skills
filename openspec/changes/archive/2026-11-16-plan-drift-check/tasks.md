## 1. Tests

- [x] 1.1 Impact paths are read from the Impact section only, and symbols are not paths.
- [x] 1.2 A build inside its plan reports no drift; an unnamed file, a low-complexity overrun, and a missing plan are reported.
- [x] 1.3 The command reads the change, its recorded areas, and the diff, and exits 1 on an unreadable change.
- [x] 1.4 The metadata write records areas when given and refuses a malformed value.
- [x] 1.5 Execute, draft, the holdout reviewer, and the reference name the check.

## 2. Implementation

- [x] 2.1 Add `affectedAreas` to the change metadata and its write command.
- [x] 2.2 Add `plan-drift.ts`.
- [x] 2.3 Run it in `/execute` and record areas in `/draft`.
