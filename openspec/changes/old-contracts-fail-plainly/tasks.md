## 1. Tests

- [x] 1.1 Prove an older contract fails plainly in parsing, `check`, and `level`, and that a contract under another constitution names supersede.
- [x] 1.2 Prove `supersede` accepts an older contract with a valid proposal and refuses one without a new approval.
- [x] 1.3 Prove tampered and malformed contracts fail as before.

## 2. Implementation

- [x] 2.1 Add the prior-contract read, the plain error, and the supersede advice.
- [x] 2.2 Report failures from `check` and `level` as JSON; let `supersede` take an older current contract.
- [x] 2.3 Add the troubleshooting entry.
