## 1. Tests first

- [x] 1.1 Add a source-of-truth contract test in `skills/delivery/checks/delivery-specs.test.ts` asserting `SKILL.md` "## Source of truth" names the live files and the two historical files as non-actionable (Seam A, scenario "Historical file disagrees with the live conductor")
- [x] 1.2 Add a test that each historical file carries the non-actionable marker and makes no source-of-truth claim (Seam A, scenario "Historical files do not claim authority")
- [x] 1.3 Add a test that no live file defers to a historical file for a rule (Seam A, scenario "Live files do not defer to historical files")
- [x] 1.4 Add a copied-skill-root test that contradicts the historical files and runs the suite through `DELIVERY_SKILL_ROOT`, expecting it to pass (Seam B, scenarios "A live rule changes" and "Historical wording contradicts live rules")
- [ ] 1.5 Confirm the new tests fail for the right reason before any product change

## 2. Implementation

- [ ] 2.1 Declare live and historical sources in `skills/delivery/SKILL.md` "## Source of truth", keeping the existing assertions
- [ ] 2.2 Mark `workflows/NOTES.md` historical and remove or rewrite its authority and stale-behaviour claims
- [ ] 2.3 Mark `workflows/delivery-orchestrator.md` historical and rewrite its source-of-truth claims
- [ ] 2.4 Add one historical-file constant in `delivery-specs.test.ts`, drop `SPECS["NOTES.md"]` from the `~25%` loop, and skip historical files in the live-contract loops without touching `LEGACY_SECTION_EXEMPT`

## 3. Verify

- [ ] 3.1 Run `bun run test` from the workspace root and confirm it is green
