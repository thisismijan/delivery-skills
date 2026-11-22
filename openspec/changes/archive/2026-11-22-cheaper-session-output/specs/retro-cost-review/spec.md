## ADDED Requirements

### Requirement: The retro measures session tool output from transcripts

When the host can export the run's session transcripts, the retro's token-cost
step SHALL run `transcript-cost.ts` on them. It SHALL report each kind of tool
output as a share of all characters and as a share with re-sends, re-reads,
reads of factory script source, whole-file reads over 350 lines, and host tool
listings per session. It SHALL say it counts characters of tool output, not
billed tokens. When no transcript can be exported, the step SHALL say so and
skip the measurement.

#### Scenario: Batch export

- **WHEN** the retro runs `transcript-cost.ts` on a batch export of session transcripts
- **THEN** it names each session and shows where its tool output went, largest first
