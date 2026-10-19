## Context

Phase 0 in `skills/delivery/SKILL.md` routes a bare key to Entry B, which always starts `ticket-to-mr.md` and may continue through review and release readiness. `workflows/auto.md` already has the next-step table; only auto reads it. `factory/scripts/ledger-store.ts` is the required mutation path (HDLV-2). Status tags live in `workflows/delivery-ledger.md`. Complexity signal: medium.

## Goals / Non-Goals

**Goals:** one pure decision for entry class and next action; illegal and unknown requests fail closed without a ledger write; the auto table remains the source of next steps.

**Non-Goals:** reconciling merge-request or Jira state (the conductor still does that first); distinguishing a live execute from a crash (HDLV-12); changing who marks a merge request ready (HDLV-10).

## Decisions

### Approved test seam: `selectNextAction`

A pure function in `factory/scripts/next-action.ts`. It classifies the argument string, looks up the reconciled status in the auto next-step table, and returns either a single step to run or a stop. An optional injected writer is accepted so tests can prove a stop never calls it. Selection itself never writes, including on a legal run: the stage writes afterwards, through the existing durable store.

This is the highest stable seam: public, executable, and driven by the live table rather than a copied list.

**Catches:**
- a bare key whose status is `[drafted]`, `[ready !N]`, or `[reviewed-blocked !N]` selecting execute, release readiness, or address comments;
- an explicit legal verb running only that step;
- an explicit illegal verb stopping with the writer uncalled;
- an unknown command word stopping with the writer uncalled;
- a status whose next step is nothing (stopped, waiting on a person, already done) stopping with the writer uncalled.

**Misses:**
- whether the conductor reconciled before calling;
- whether a session follows the Phase 0 prose;
- live vs crashed `[executing]` (HDLV-12).

**Controlled fakes:**
- a recording writer whose call count must stay zero on every stop;
- status strings supplied by the test, already reconciled;
- the real `auto.md` table and the real Phase 0 verb list, parsed, never copied into the helper as a second table.

### Table is parsed, not copied

Known verbs come from the Phase 0 match column. Next steps come from `### Next step by status` in `auto.md`. A small keyword map translates table wording (Execute, Release readiness, Address comments) into the matching verb. Status tags with `!N`, `<reason>`, `<what>`, or `<KEY>` match the same way the ledger vocabulary tests already normalise them.

A bare key with no ledger is the start of ticket delivery: draft. Auto's "no ledger yet" row stays for idea-shaped starts, which are not this helper.

`build` is execute. `status`, `help`, `auto`, and `improve` skip the status-machine check. Other explicit lifecycle verbs are legal only when they appear as a next-step keyword for that status; the first keyword is what a bare key resumes.

`[waiting: <what>]` has no stage verb in the table; the status-tag meaning already names `/delivery auto <KEY>` as the resume command, so a bare key selects auto.

### Phase 0 wiring

The bare-key row becomes Resume: reconcile, call the helper, run the selected step. Entry B no longer walks Stages 2 to 4. Explicit verb rows stay; after Phase 1 the conductor still calls the helper so an illegal verb stops. Unknown command words (a single unmatched command token) stop without a write. Prose, paths, and a bare MR iid keep their existing entries.

### Alternatives considered

- Teach only the prose and extend wording tests: rejected, it cannot prove an illegal verb left the ledger untouched.
- Copy the next-step table into code: rejected, it would drift from `auto.md`.
- Make a bare key run auto's whole loop: rejected, auto remains the whole-lifecycle command; resume runs one legal step and prints Next.

## Risks / Trade-offs

- Prose is still run by a model. The helper proves the rules; wording tests require Phase 0 and Entry B to name it.
- `[executing]` still selects review, including when no merge request exists. HDLV-12 owns that gap.
- A keyword map can miss a newly worded table cell. The documentation contract that every status has a next step already fails if a row is empty; helper tests pin the statuses in the ticket scenarios.
