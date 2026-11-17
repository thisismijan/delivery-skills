## 1. Tests

- [x] 1.1 The description check accepts both sections, accepts no decisions, and refuses a missing, empty, repeated, or "none" unproven section, from the forge create input.
- [x] 1.2 Docs contract: the handoffs carry Decisions, `/execute` names both sections and the check, and the readiness brief always carries its two sections.

## 2. Implementation

- [x] 2.1 Add `change-description.ts`.
- [x] 2.2 Add the Decisions heading to the three handoffs.
- [x] 2.3 Write and check the two sections in `/execute`; carry them in the readiness brief and lenses.
