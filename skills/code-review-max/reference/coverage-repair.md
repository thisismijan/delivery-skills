# Repairing a lens report

Read this when the coverage command refuses a lens report, or when a lens's candidates cannot be read in the lens format.

A lens report is advisory output (`subagent-outputs.ts policy review-lens`):
when the refusal names a lens report that has no `Examined files:` list or
cannot be read, give that same lens one repair turn with the script's message,
asking only for its corrected report and no new review, then run `coverage`
again. A second refusal stops the review. A lens whose candidates cannot be
read in the lens format gets the same single repair turn. Adjudication output
is gating and is never repaired.
