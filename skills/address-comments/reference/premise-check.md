# Premise checks

Read this when step 5 records a repeated assumption, or when two fix attempts
in step 6 or step 8 fail on the same assumption, before writing the next fix.

## Repeated assumption

Applies when `review-rounds.ts record` exits 3 in step 5. The printed
`repeated` labels were already broken in an earlier round, so patching them
again is likely to miss the next case too. Before writing any fix for those
comments, state the premise behind the current approach and run one
discriminating observation that could disprove it, such as listing every way
the input can be written and checking whether the approach can cover them all.
When it shows the approach cannot be made complete, replace the approach
instead of adding another case: the fix changes the code and the spec
together. Write what you observed and chose to a file and record it with
`bun "${FACTORY_ROOT}/scripts/review-rounds.ts" premise "<repoRoot>/.review/<changeName>/review-rounds.json" <assumption> <outcome.md>`.
When no defensible approach comes out of it, stop and escalate with the
premise, the observation, and the options, following the conductor's Human
decision brief.

## Repeated fix failures

Applies in step 6 and step 8 once two fix attempts for the same comment or
gate have failed. After **two failures that share the same assumption**,
**state the premise** and run **one discriminating observation** that could
disprove it. There is **no third fix** before this check. If it does not
reveal a defensible next action within `maxFixAttempts`, stop and escalate.
