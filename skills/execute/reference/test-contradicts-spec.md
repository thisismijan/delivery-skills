# A test that contradicts the spec

This applies at step 8 when the implementer's handoff lists a failing test under **Test contradicts spec**.

Do not dispatch the implementer for that test. Dispatch the `test-writer` once
with the work item, the spec scenario, and that line, to correct only the named
test to the spec's contract. It never removes or loosens any other assertion.
Then re-run the green gate. The holdout review still checks every test against
the spec. A second contradiction on the same test stops and escalates.
