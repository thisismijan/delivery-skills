# Frontier model evaluation

A paired evaluation of models for the frontier tier: the work the catalogue
calls "routing, architecture, high-risk reasoning, and adjudication".

## The fixture

`fixture/` is a small repository with two frontier jobs, described in
`task.md` and answered in the shape `output-contract.md` gives:

1. **Approach challenge.** `openspec/changes/rate-limit/` plans an in-memory
   counter keyed by user id. The fixture plants two gaps the challenger
   should find from the code: `src/server.ts` forks several worker processes,
   so each keeps its own counter, and anonymous clients, which the spec
   limits too, have no user id (`src/auth.ts`).
2. **Adjudication.** `review-candidates.json` lists four findings about
   `src/fees.ts`. Two are real and two are false, and the code decides each.

The answer key lives only in `scripts/frontier-eval-score.ts`, which the
model under test never sees. Missing a planted gap, or rejecting a real bug,
is a critical miss.

`webhook/` is the harder fixture: a webhook de-duplication plan with three
planted gaps (two deliveries racing through an eight-job queue, a
de-duplication key from a header the signature does not cover, and a refund
handler registered under an event name the provider never sends) and a decoy
(the code runs one instance, so a multi-process concern is a false alarm). Its
adjudication has five findings about `src/ledger.ts`, two of them real. Its
answer key was committed before any run.

## Running it

For each run, copy `fixture/`, `task.md`, `output-contract.md`, and
`agents/approach-challenger.md` (as `agent/approach-challenger.md`) into a
fresh directory. Start one read-only subagent on the model under test with
that directory as its only context, and save its final reply as the run's
answer. Then:

```bash
bun scripts/frontier-eval-score.ts <answer.json> <result.json> <model>
bun scripts/generate-paired-evidence.ts <paired-plan.json> <paired-evidence.json>
bun scripts/paired-evaluation.ts <paired-evidence.json> [paired-result.json]
```

The plan follows the version 2 format in `docs/reference.md`: three or five
runs per arm, with alternating order, identical controls, and the run's
copy of the tree as its managed tree.

## Results

Each dated folder under `runs/` keeps one evaluation: the plan, every run's
answer, score, and usage, the evidence, and the evaluator's result. A run's
managed tree is the catalogue that arm would ship, so the arms differ only in
which model comes first for frontier work.

### 2026-11-23: Gemini 4 Neon xhigh against Claude Opus 5.5 high

Three runs per arm, started together at 17:17 UTC. Every run's copy of the
fixture came back unchanged.

- **Evaluator decision: pass.** Both arms scored full utility on every run,
  so the ratio is 1.0, all three pairs clear the 90 percent bar, and neither
  arm made a critical miss.
- **What the pass shows:** Gemini matched Opus on this fixture. Because Opus
  also scored full marks, the fixture cannot show whether Gemini is as good
  on harder work.
- **Seen in the answers, not scored:** every Opus run also found a third real
  flaw that was not planted. The user id is the first 8 characters of the
  token, and any token is accepted, so a client can get a fresh limit by
  sending a new token. No Gemini run found it. Every Gemini run instead noted
  that the spec has no scenario for a client allowed again after the minute.
  Neither observation changes the score, because the checks were fixed before
  the runs.
- **Efficiency:** wall time was taken when each result reached the
  coordinator, so it is approximate; Gemini's runs finished about 48 seconds
  later. Usage is in characters, not tokens, so cost was not measured.

### 2026-11-23: the harder webhook fixture, five runs per arm

Ten runs, started together at 17:32 UTC. Every run's copy came back
unchanged.

- **Evaluator decision under the key committed before the runs: fail.** One
  Gemini run (run 5) had a critical miss on the race. Every other check passed
  on every run in both arms: the median utility ratio is 1.0 and all five
  pairs clear the 90 percent bar.
- **That miss is a scorer error.** Run 5 wrote "a retried delivery arrives
  while the first delivery is still executing in the 8-worker queue, so both
  deliveries miss the in-memory Set check and execute the handler twice". That
  is the race, in words the key did not match. The matcher was widened after
  the runs to accept "while the first ... still" and "still executing", with a
  test, and it changes no other score in either arm.
- **Re-scored with that matcher (labelled, beside the official result):
  pass,** with no critical misses.
- **Both models found the replayable unsigned header on every run,** unlike
  the first fixture. Both also raised real problems that were not planted: a
  crash between the handler and the record, an empty-header collision, and an
  acknowledgement sent before processing.
- **Efficiency:** Gemini's runs finished about 3.3 minutes later on average,
  and its answers were longer. Wall times are approximate. Cost was not
  measured.

### 2026-11-23: webhook rerun, five runs per arm, with measured time

Ten fresh runs, started together at 17:51 UTC and scored with the key that
was on main at `10bc0fb` before any of them started. Every run's copy came
back unchanged. Answers, wall times, and character counts come from each
run's own record, not from when the result reached the coordinator.

- **Evaluator decision: pass.** Every run in both arms passed every check:
  the utility ratio is 1.0, all five pairs clear the 90 percent bar, and
  there are no critical misses.
- **Time:** Opus took 37 to 43 seconds per run, and Gemini 243 to 323 seconds,
  about seven times longer. The median difference is 230 seconds.
- **Output:** Gemini's answers averaged about 1,300 characters longer.
  Visible reasoning was about 26,000 characters per Gemini run against about
  1,400 per Opus run (`visible-reasoning-chars.json`). The two hosts may
  expose reasoning differently, so this is not a token comparison.
- **Cost:** not measured. This environment does not expose billed token
  counts for these runs.
