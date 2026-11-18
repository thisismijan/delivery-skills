# Implementation model edge cases

This applies at step 6 when the change-meta read exits non-zero or `select-model.ts` prints `opus`.

- If the meta read exits non-zero (a change drafted before this file existed,
  or a corrupt file), **do not guess**: treat it as no defended case and use
  `sonnet` (PRD §9: absent a recorded, defended complexity case, Sonnet).
- If the semantic selection prints `opus`, the recorded justification must
  appear in the MR description. At the `max` level `select-model.ts` prints
  `opus` for every implementation; the justification is then the run's level,
  and the MR description says so.
