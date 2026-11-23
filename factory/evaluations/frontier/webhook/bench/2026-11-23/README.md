# Model benchmark: webhook fixture, 2026-11-23

Every model family this Cursor offers, one variant each, mostly at its `high`
reasoning setting, run three times on the webhook fixture in
`../../fixture`. Answers were scored with the answer key on main at
`5a5c1da`, committed before any run. Opus 5.5 high and Gemini 4
Neon xhigh use their five runs from `../../runs/2026-11-23-rerun`. Each model
was also compared with Opus 5.5 high by `paired-evaluation.ts`, pairing its
three runs with Opus's first three.

| Model | Runs | Score | Runs with every check | Critical misses | Median time | Median answer (chars) | Evaluator vs Opus 5.5 |
|---|---|---|---|---|---|---|---|
| GPT-5.6 Sol (high) | 3 | 100% | 3 of 3 | 0 | 30 s | 2,179 | pass |
| Claude Sonnet 5.5 (high) | 3 | 100% | 3 of 3 | 0 | 34 s | 3,976 | pass |
| GPT-5.6 Terra (high) | 3 | 100% | 3 of 3 | 0 | 37 s | 1,543 | pass |
| Claude Opus 5.5 (high), current first choice | 5 | 100% | 5 of 5 | 0 | 40 s | 3,455 | baseline |
| GPT-5.6 Luna (high) | 3 | 100% | 3 of 3 | 0 | 42 s | 1,884 | pass |
| GLM 5.2 (high) | 3 | 100% | 3 of 3 | 0 | 44 s | 2,502 | pass |
| Kimi K3 (high) | 3 | 100% | 3 of 3 | 0 | 50 s | 3,253 | pass |
| Muse Spark 1.3 (high) | 3 | 100% | 3 of 3 | 0 | 52 s | 1,889 | pass |
| Muse Wonder 1.0 (high) | 3 | 100% | 3 of 3 | 0 | 64 s | 2,941 | pass |
| Claude Opus 4.6 (high) | 3 | 100% | 3 of 3 | 0 | 66 s | 2,074 | pass |
| Grok 4.5 (high) | 3 | 100% | 3 of 3 | 0 | 80 s | 1,933 | pass |
| Gemini 4 Neon (high) | 3 | 100% | 3 of 3 | 0 | 125 s | 4,019 | pass |
| Grok 4.6 (high) | 3 | 100% | 3 of 3 | 0 | 136 s | 2,029 | pass |
| Gemini 4 Neon (xhigh) | 5 | 100% | 5 of 5 | 0 | 273 s | 4,817 | pass (five-run rerun) |
| Gemini 4 Carbon (high) | 3 | 100% | 3 of 3 | 0 | 331 s | 5,573 | pass |
| Composer 2.5 | 3 | 97% | 2 of 3 | 1 | 23 s | 1,672 | fail |
| Kimi K2.7 Code | 3 | 97% | 2 of 3 | 1 | 623 s | 2,213 | fail |
| Gemini 3.1 Pro | 3 | 94% | 1 of 3 | 2 | 88 s | 1,658 | fail |
| Claude Opus 4.7 (high) | 3 | 34% | 1 of 3 | 10 | 83 s | 3,813 | fail |
| Claude Opus 4.8 (high) | 3 | 34% | 1 of 3 | 10 | 108 s | 3,433 | fail |

## Reading it

- **Fifteen models found every planted gap and judged every finding on every
  run.** On this fixture, quality does not separate them; time, answer length,
  and following the output contract do.
- **Opus 4.7 and Opus 4.8 broke the output contract, not the reasoning.** Two
  of three runs for each wrote a summary before the JSON. The pipeline refuses
  such answers, as the scorer did. Read as JSON, all six of their runs pass
  every check (`lenient-opus-4-7-4-8.md`).
- **The keyword answer key misreads some answers.**
  - Composer 2.5 run 2 and Kimi K2.7 Code run 2 described the race ("both pass
    the in-memory set check before either inserts, so the handler runs
    twice") without the words the key looks for, so each lost a check it
    arguably passed.
  - Gemini 3.1 Pro run 2 never mentioned the refund mismatch, but got credit
    because its evidence cited the provider's event list.
  - Gemini 3.1 Pro's other misses are real: run 2 did not say the header is
    unsigned, and run 3 cited the design, not the code, for the race.
  - The key was not changed after these runs. A judged check with a self-test,
    which `paired-evaluation.ts` already supports, would be sturdier than
    keywords.
- **Time per run ranges from about 23 seconds (Composer 2.5) to about 10
  minutes (Kimi K2.7 Code).** Times come from each run's own record.
- **Cost was not measured.** Billed token counts are not available for these
  runs.
- **Limits.** One fixture, one kind of work (frontier reasoning), and three
  runs per model.
