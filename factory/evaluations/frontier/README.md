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

`renewals/` is the hardest, built because fifteen models tied at full marks
on `webhook/`. A nightly subscription-renewal plan has four planted gaps, and
each one shows up only by reading across files:

- `addMonths` turns 31 January into 3 March.
- A `requires_action` charge, where no money moved, renews the subscription
  because the design checks only for `declined`.
- The next night's retry of a declined card sends the same idempotency key, so
  the gateway returns the stored decline for seven days without trying the
  card.
- `resume` leaves `renewsAt` in the past, so a resumed subscription is charged
  for the months it was paused.

It also has two decoys that the code refutes. Three replicas run the
scheduler, but a unique key on `job_runs` runs the job once a night. A crash
between the charge and the save looks like a double charge, but the repeated
idempotency key returns the first result.

Its adjudication has six findings about `src/proration.ts`. The three real
ones are a text sort, a text comparison, and March counted as 30 days under
the deployment's `Europe/London` clock change. The three false ones are a
division the code guards, `parseInt("08")`, and a `reduce` the code guards. A
test runs the fixture's own code to keep those facts true.

## Scoring

The output contract and the adjudication are checked by code. Whether a gap
finds a planted problem, or raises a decoy, is decided by a judge model
against a rubric in `scripts/frontier-eval-score.ts`. Each rubric item says
what counts and what does not. Keywords were tried first and misread answers
in both directions (`webhook/bench/2026-11-23`).

A judge's scores count only after it passes the fixture's calibration set,
`judge-calibration.json` beside each fixture:

- One known-good answer and one known-bad answer.
- Labelled answers whose reading is fixed in advance: paraphrases, near
  misses, and, for `webhook/`, the benchmark answers the keyword key misread.

The judge must agree with every label, and must score the good answer above
the bad one. A judgement names the answer it judged by a hash of the answer
text, so it cannot be applied to another answer.

## Running it

For each run, copy `fixture/`, `task.md`, `output-contract.md`, and
`agents/approach-challenger.md` (as `agent/approach-challenger.md`) into a
fresh directory. Start one read-only subagent on the model under test with
that directory as its only context, and save its final reply as the run's
answer.

Calibrate the judge once per fixture. Start the judge with each prompt alone,
under a file name that does not reveal the case, and save each reply as
`<case>.judgement.json`:

```bash
bun scripts/frontier-judge.ts calibration <fixture> <dir>
bun scripts/frontier-judge.ts self-test <fixture> <judge-model> <dir> <self-test.json>
```

Then, for each answer:

```bash
bun scripts/frontier-judge.ts prompt <fixture> <answer.json> > prompt.md
bun scripts/frontier-eval-score.ts <answer.json> <result.json> <model> <fixture> --self-test <self-test.json> --judgement <judgement.json>
bun scripts/generate-paired-evidence.ts <paired-plan.json> <paired-evidence.json>
bun scripts/paired-evaluation.ts <paired-evidence.json> [paired-result.json]
```

An answer outside the output contract, or with no gaps, needs no judgement.

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

### 2026-11-24: the webhook benchmark re-scored by the judge

All 64 webhook answers (`webhook/bench/2026-11-23`, plus the five-run rerun)
were re-scored with judged gap checks: Claude Opus 5.5 high scoring, GPT-5.6
Sol high checking. The judged results are in `webhook/bench/2026-11-23/judged`.

- **The judge changed 9 checks from the keyword key.**
  - It gave the race back to Composer 2.5 run 2, Kimi K2.7 Code run 2, and
    Gemini 3.1 Pro run 3.
  - It took away five credits the keywords had given: the refund mismatch
    from Opus 4.6 runs 1 and 2 and from Gemini 3.1 Pro run 2, and the unsigned
    header from Composer 2.5 runs 2 and 3. Composer run 3 says the body id is
    the unsigned one, the wrong way round.
- **The two judges agreed on 252 of 256 gap decisions.** All four
  disagreements are terse GPT-5.6 Luna and Terra answers. Sol, the stricter
  judge, wanted the `refund.created` registration named.

### 2026-11-24: the renewals fixture, every model

Every model from the webhook benchmark, three runs each, scored with judged
gap checks. Full results are in `renewals/bench/2026-11-24`.

- **Nine models passed every check on every run:** Sonnet 5.5, GPT-5.6 Sol,
  Opus 5.5, Kimi K3, Muse Spark 1.3, Opus 4.7, Gemini 4 Neon high and xhigh,
  and Gemini 4 Carbon.
- **The other eleven missed something.** Scores ran from 98% (Opus 4.6) down
  to 60% (GLM 5.2).
- **The repeated idempotency key was the gap most often missed.**
- **The judges agreed on 358 of 360 decisions.**
