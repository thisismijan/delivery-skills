# The webhook benchmark, re-scored by a judge

Each answer under `../runs` and `../../../runs/2026-11-23-rerun/runs` was
judged against the webhook rubric in `scripts/frontier-eval-score.ts`. Claude
Opus 5.5 high scored and GPT-5.6 Sol high checked. Both passed the webhook
calibration set first (`judges/`).

`comparison.json` lists every check where the judge and the keyword key
disagree, both judges' disagreements, and each run's utility under both
scorings. The four answers that broke the output contract need no judge and
score as before.
