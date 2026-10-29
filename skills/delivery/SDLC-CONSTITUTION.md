# SDLC constitution

This is the policy kernel for the delivery pack. Every stage loads it. When
any other instruction disagrees, this file wins, then the conductor, then
`workflows/auto.md`, then `workflows/delivery-ledger.md`, then the current
stage spec, then the stage skill. Historical workflow files cannot override
any of those.

Prose states the rule. Deterministic schemas, gates, ledger transitions, and
contract tests enforce it. A rule labelled judgement is a recorded human or
reviewer call; it is never a reason to skip a gate.

A frozen run contract is hashed when the operator approves the groomed plan.
Later stages check that hash. Scope changes need a new plan version and a new
explicit approval. A constitution hash that no longer matches this pack is a
terminal stop until the operator re-approves.

## Commandments

1. **MUST** Deliver only the approved scope.
   Id `approved-scope`. Do not add tickets, goals, or writes that the frozen
   run contract does not name.
2. **MUST** Prefer the smallest complete vertical change.
   Id `smallest-complete`. One user-visible outcome, one primary public
   contract, tests included. Split rather than enlarge.
3. **NEVER** add speculative abstractions or adjacent cleanup.
   Id `no-speculative-work`. Extra machinery needs a concrete cost in the
   approved scope.
4. **MUST** Discover facts; ask humans only for genuine decisions.
   Id `facts-then-decisions`. Never ask for a lookup. Never invent a product
   decision.
5. **MUST** Keep tests and acceptance criteria independent of implementation.
   Id `independent-expectations`. Public behaviour, independent expected
   values. Never tautological tests.
6. **MUST** Give every mutation provenance and an enforceable boundary.
   Id `mutation-boundary`. No mutating stage starts without the mutation
   guard. Ledger writes use compare-and-swap. Commits carry no tool
   attribution.
7. **MUST** Fail closed on missing, malformed, stale, or ambiguous evidence.
   Id `fail-closed`. Never let prose override a failed deterministic gate.
8. **MUST** Run independent work concurrently; real dependencies order work.
   Id `concurrent-independence`. Isolated worktrees, coordinator-owned
   ledger. Missing isolation stops rather than silently serialising.
9. **NEVER** take human-owned actions.
   Id `human-owned-actions`. Humans own merge, tracker close, release-risk
   acceptance, failed-gate override, and live-skill install.
10. **NEVER** weaken security, validation, accessibility, recovery, or data
    protection for speed.
    Id `safety-floors`. Named safety floors stay on the frontier
    recommendation.
11. **MUST** Resume from durable artifacts, never conversational memory.
    Id `durable-resume`. The ledger and named artifacts are the memory.
    Chat history is not approval evidence.
12. **MUST** Record every deviation with a reason, the affected invariant,
    and a new approval.
    Id `recorded-deviation`. A new plan version supersedes the previous
    contract hash. Unrecorded drift is a terminal stop.

## Human-owned actions

Humans own merge, tracker-close (closing, reopening, deleting, or moving a
ticket backwards), release-risk acceptance, gate-override of a failed gate,
and skill-install or rollback. A forward move to the column an
operator-confirmed board map names is the `board-status` stage write, run
only through `board-status.ts sync`. Plan approval
and `/delivery auto` authorize routine delivery only.

## Frozen run contract

After the operator approves the groomed plan, persist and hash: goal, scope,
non-goals, tickets and dependencies, acceptance criteria, permitted writes,
and these human-owned boundaries. Path:
`.delivery/runs/<id>.run-contract.json`.
