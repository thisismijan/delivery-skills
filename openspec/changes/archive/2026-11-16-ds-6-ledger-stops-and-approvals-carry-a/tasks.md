## 1. Tests

- [x] 1.1 Prove New stop and approval lines with a UTC time are written.
- [x] 1.2 Prove A new line with a date only is refused.
- [x] 1.3 Prove A time that is malformed or runs into the next text is refused.
- [x] 1.4 Prove A line that is not a single timed bullet is refused.
- [x] 1.5 Prove The first write of a ledger is checked and creates nothing when refused.
- [x] 1.6 Prove A stale generation is reported before the time check.
- [x] 1.7 Prove A worker journal write is checked the same way.
- [x] 1.8 Prove Other sections keep their date-only form.
- [x] 1.9 Prove The ledger format page names the form and no other skill file copies it.
- [x] 1.10 Prove A date-only ledger is updated and its older lines are untouched.
- [x] 1.11 Prove An edited, backfilled, or dropped older line is refused.
- [x] 1.12 Prove Heading variants and a second heading are all checked.
- [x] 1.13 Prove A dropped or renamed section is refused.

## 2. Implementation

- [x] 2.1 Implement the specified behaviour so every scenario above holds.
