## Why

Twelve delivery-stage sessions from 19 November produced about 3.3 million
characters of tool output, roughly 68,000 tokens each, and every result is
re-sent on each later step. The measurable waste in them was not large file
reads:

- 8 of the 12 sessions read a factory script's source to learn how to call it.
- Every skill loads `RUNTIME.md`, at 14.5 KB, and some sessions read it two or
  three times.
- Sessions listed every host tool 3.7 times on average.
- Test gates printed their whole test log into the conversation.

## What Changes

- `forge-provider.ts`, `work-item-provider.ts`, `review-fanout.ts`, and
  `forge-comments.ts` print every operation's input shape with `--help`. The
  runtime notes forbid reading a script's source to learn how to call it.
- `RUNTIME.md` drops from 14.5 KB to 9.5 KB. Fast-model evaluation and review
  fan-out detail move to `factory/reference/`, read only when a stage needs
  them.
- `mcp-inventory.ts fresh` lets a run reuse a host-tool inventory recorded
  within 12 hours. A planned tool that turns out to be missing triggers a new
  recording.
- `test-gate.ts --out` keeps the full report in its file and prints a short
  summary. `quiet-run.ts` does the same for lint, typecheck, and other long
  commands.
- `transcript-cost.ts` measures where a session's tool output went from
  exported transcripts, and the retro's token-cost step runs it when
  transcripts are available.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `portable-runtime-contract`: self-describing commands, on-demand runtime
  detail, inventory reuse, and quiet command output.
- `test-gate`: a gate can write its full report to a file and print a summary.
- `retro-cost-review`: the retro measures session tool output from exported
  transcripts.

## Impact

`factory/RUNTIME.md`, two new files under `factory/reference/`, new scripts
`cli-help.ts`, `quiet-run.ts`, and `transcript-cost.ts`, changes to
`forge-provider.ts`, `work-item-provider.ts`, `review-fanout.ts`,
`forge-comments.ts`, `mcp-inventory.ts`, and `test-gate.ts`, the execute and
address-comments gate invocations, the retro workflow, `README.md`, and
`docs/reference.md`.
