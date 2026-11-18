# Test-gap comments

Read this in step 6 for a comment classified `test-gap`: it asks only for a
test of behaviour the assessor confirmed is already correct.

The test cannot go red, so there is no red gate and no operator stop. Write
the test scoped to the comment, format it, and commit it referencing the
comment. Run the green gate, lint, and typecheck. Then prove the test bites:
write a minimal patch to the source, never a test, that breaks exactly the
behaviour the test covers (the change the comment names, such as deleting a
condition, when it names one), and run
```
bun "${FACTORY_ROOT}/scripts/mutation-proof.ts" "<repoRoot>" "<reviewDir>/green-command-<commentId>.json" "<reviewDir>/mutation-<commentId>.patch" | tee "<reviewDir>/mutation-proof-<commentId>.json"
```
It applies the patch to the clean worktree, requires the new test to fail the
way a red gate does, and restores the source byte for byte. Exit 1 means the
test does not catch the break: strengthen the test and try again within
`maxFixAttempts`, then stop and escalate. A restore failure is a terminal
stop. If writing the test shows the behaviour is not correct after all, the
comment is a `bug`: follow the `bug` path instead. Never use this class to
skip the red gate on a defect.
