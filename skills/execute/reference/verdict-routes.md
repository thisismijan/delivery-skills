# Verdict routes other than approve

This applies at step 11 when `review-route.ts` prints an `action` other than `approve`.

- **`fix`** → dispatch the `implementer` subagent to address the verdict
  `findings`, format and update the spec in that fix commit as step 8 says,
  re-run the **green gate** (step 8), increment `attempt`, and **go back to
  step 10** (re-review runs fresh: it does not see the fixer's reasoning).
  **No MR is created during the fix loop.** If two failed fixes share the same
  assumption, apply the premise checkpoint from step 8 before any third fix.
- **`escalate`** → push the branch (`git push -u origin <changeName>`) so a
  human can inspect the work, post the `reason` (and any `findings`) as a
  selected-provider note, and stop (NEEDS_HUMAN). **Do not open an MR**; the
  review did not pass and the human decides what happens next.
