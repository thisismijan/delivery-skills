# Frontier fixture task

You are working in a small repository, the current directory. Do two jobs and
answer with one JSON object, as `output-contract.md` describes. Read files
only; change nothing.

## Job 1: challenge the approach

Act as the approach challenger in `agent/approach-challenger.md`. The work
item is `openspec/changes/idempotent-webhooks/proposal.md`. The change is
`openspec/changes/idempotent-webhooks/` (proposal, design, and specs). The
feasibility sketch is `feasibility-sketch.md`. Read the code the approach
will run against under `src/`, and the provider's documentation under
`docs/`. Put your `ApproachChallengeVerdict` under `approach`.

## Job 2: adjudicate review candidates

`review-candidates.json` lists findings that review lenses raised about
`src/ledger.ts`, and the spec they were checked against. Verify each one
against the code. Confirm it only when the code shows the problem; reject it
when the code shows it is not a problem. Cite the `path:line` that decides it.
Put the decisions under `adjudication`.
