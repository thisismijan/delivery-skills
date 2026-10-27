## 1. Scanner

- [ ] 1.1 Parse a unified diff into files with added and removed lines; refuse an unreadable diff.
- [ ] 1.2 Mark surfaces from paths and changed lines with evidence, excluding spec and delivery artefacts.
- [ ] 1.3 Report one-way signals for destructive SQL.
- [ ] 1.4 Report lowered-bar hits for TypeScript, Python, and Java.
- [ ] 1.5 Add a CLI that scans `base...head` from git.

## 2. Tests

- [ ] 2.1 Prove each surface, the exclusions, and the one-way signal.
- [ ] 2.2 Prove each lowered-bar kind, and that a reworded assertion is not a hit.
- [ ] 2.3 Prove an unreadable diff fails and the CLI scans a real git range.

## 3. Workflows

- [ ] 3.1 Release readiness steps 2 and 4 start from the scan; scanned marks are a floor.
- [ ] 3.2 `/code-review-max` classification takes the scan's surfaces.
- [ ] 3.3 Pin the workflow wording with a contract test, and note the script in the conventions and reference docs.
