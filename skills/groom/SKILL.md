---
name: groom
description: Grooming — turn raw input (idea, HLD, or PRD) into small, individually deployable ticket drafts ready for /draft. Writes only to the grooming output directory. No MCP, no git, no tracker.
---

Resolve this SKILL.md to its real path, then load the first existing runtime:
`../_factory/RUNTIME.md` (Cloud store), `../../factory/RUNTIME.md` (clone), or
`$DELIVERY_FACTORY_ROOT/RUNTIME.md`. Follow its `FACTORY_ROOT` procedure and
Export `FACTORY_ROOT` as that file describes. When a step names a subagent, read
`$FACTORY_ROOT/agents/<name>.md` and follow it. Do not invent a cheaper substitute prompt.
Load the SDLC constitution (`SDLC-CONSTITUTION.md` beside the delivery skill).
It outranks this skill. Verify with
`bun "${FACTORY_ROOT}/scripts/sdlc-constitution.ts" preflight`.


You are running **/groom**.

This command turns whatever the operator provides (a file path, inline text, or conversation context) into a set of small, individually deployable ticket drafts. It grounds itself read-only in the codebase, classifies the input shape and recommends it to the operator, grills the idea one question at a time, conditionally synthesizes a PRD and proposes a numbered vertical-slice breakdown (or, for a single small ask, proposes the one ticket directly), and only on approval writes the output files.

## Hard rules

- **No MCP, git, or work-item provider tools.** This command and both its subagents (`groom-explorer`, `groom-writer`) carry no MCP, git, or provider tools. `Bash` is present on this command ONLY to run the local deterministic Bun scripts (`groom-paths.ts`, `verify-ticket.ts`, `human-text.ts`) and to make the idempotent `.gitignore` edit. Never invoke `git`, a forge CLI, or any remote work-item call from it. A run produces zero commits and zero remote work-item activity. All writes land only under the grooming output directory (plus the single `.gitignore` line).
- **One question per turn.** The grilling loop emits exactly one question per turn, always with a recommended answer. Never batch two or more questions into a single turn.
- **Atomic and complete.** Every ticket is one useful vertical outcome that can be understood, tested, implemented, and reviewed in one fresh small-context session. Prefer another ticket over another independent outcome.
- **Write nothing before approval.** No draft file is written until the operator explicitly approves the ticket or the slice breakdown. The conductor freezes that approved plan as the run contract. This skill does not invent extra tickets after that yes.
- **Fail closed on bad drafts.** A draft that fails `verify-ticket.ts` is fixed and re-emitted, never written as the final artifact.
- **All human-facing output passes through `sanitizeHumanText`.** No em dashes or en dashes in any output (see `scripts/human-text.ts`).

## Steps

### Step 1 — Resolve input (precedence: file path > inline text > conversation context)

Examine the skill arguments:

- If the skill arguments look like a file path (no newline, ends in `.md` or `.txt`, or starts with `/` or `./`), attempt to read it. If readable, use its content as input.
- If the skill arguments are non-empty inline text, use them directly as input.
- If the skill arguments are empty or absent, look for usable context in the current conversation (a pasted idea, HLD, or description).
- If there is genuinely no usable input anywhere, **stop and ask** the operator to provide an idea, file path, or description. Do not guess or proceed on nothing.

### Step 2 — Derive the output directory

Run the deterministic path helper to get the output directory. Use the first meaningful title line from the input (or a short description of the topic) as the title argument:

```
bun "${FACTORY_ROOT}/scripts/groom-paths.ts" "<title>"
```

Use the printed `dir` value (e.g. the directory printed by `groom-paths.ts`) as the output directory for this run. The same title always yields the same directory, so a re-run lands in the same place.

### Step 3 — Read-only codebase grounding (before any grilling question)

Dispatch the `groom-explorer` subagent with the input and the target codebase. It maps relevant modules, seams, and domain terms. Wait for its report before proceeding to grilling.

The grilling loop and slice proposals **MUST** reference concrete module names, file paths, or domain terms from the explorer's report. Do not ask generic questions — ground every question in what the codebase actually contains.

### Step 4 — Classify the input shape (before any grilling question)

Before asking the operator anything, classify the input as one of:

- **A single ticket:** one atomic, self-contained vertical outcome that meets the context-budget checklist in Step 7.
- **A PRD-worthy initiative:** broad enough to need a PRD and a vertical-slice breakdown into multiple tickets.
- **A split-worthy ask:** reads as more than one ticket's worth of work but does not need a full PRD.

Base the classification on the input itself and the explorer's report (Step 3). Present the classification to the operator as a recommendation (for example, "This reads as a single ticket, recommend skipping the PRD" or "This reads as two tickets, recommend a split before we go further"). The operator can accept the recommendation or override it. This recommendation determines whether Steps 6 and 7 run at all (see below) — it is not a formality.

If two or more classifications remain genuinely viable, follow the delivery
conductor's **Human decision brief** before asking. If evidence supports only
one classification, present that recommendation directly without manufacturing
alternatives.

### Step 5 — Grilling loop (one question at a time, each with a recommended answer)

Ask the operator questions to fill in gaps, resolve ambiguities, and surface constraints. Rules:

- **Exactly one question per turn.** Never batch two or more questions.
- **Every question includes a recommended answer** (e.g. "Recommended: Yes, scope it to the dashboard page only."). The operator can accept the recommendation or override it.
- When a question offers two or more viable product or slicing choices, first
  follow the delivery conductor's **Human decision brief**, including both
  technical lenses. Factual and single-viable-path questions stay direct.
- Maintain a **question frontier**: ask only a question whose prerequisites are already settled. Do not ask downstream scope or acceptance questions while an earlier product decision can change them.
- **Facts are discovered; decisions are asked.** Inspect the input and codebase for facts. Ask the operator only for intent, trade-offs, or decisions that cannot be discovered.
- **Prefer inspecting the code** over asking when the answer is discoverable from the codebase (the explorer's report or a direct `Read`/`Grep`).
- **Depth scales to input maturity.** A thin or raw idea is grilled harder (more questions) than an already-detailed PRD of equivalent scope. Assess the input's completeness and calibrate accordingly.
- Ask about: user impact, scope boundaries, success criteria, constraints or NFRs, blocked-by dependencies, out-of-scope items, and acceptance criteria phrased as Given/When/Then behaviour statements. Never ask about test seams or implementation decisions — those are how-level questions owned by `/draft` and `/execute`, not grooming.
- Continue until you have enough to write a PRD (if warranted) and propose a slice breakdown, or to write a single ticket directly.

### Step 6 — Conditional PRD synthesis

This step runs only when Step 4's recommendation is a PRD-worthy initiative.

- **PRD-worthy:** synthesize the PRD **in memory**. It MUST contain these sections: Problem, Solution, User stories, Success criteria, Constraints / NFRs, Out of scope. It MUST NOT contain an `Implementation decisions` or `Test seams` section, and no prose describing how the change will be built or tested. Offer it in chat for review before proposing slices. Incorporate feedback, but write no file before slice approval.
- **Single ticket, or split-worthy without a PRD, or otherwise trivial:** state explicitly that the PRD was skipped, and why (single ticket, or split-worthy without needing a PRD).

### Step 7 — Propose the ticket breakdown (approval-gated)

What you present here depends on Step 4's recommendation:

- **Single ticket:** present the one ticket's content (context, story, what to build, acceptance criteria as Given/When/Then statements, out of scope, blocked by) directly for operator approval. Skip the numbered vertical-slice breakdown entirely — there is only one deliverable.
- **PRD-worthy or split-worthy:** present a numbered list of proposed vertical slices. Each slice maps to **exactly one user story** (a ticket carries at most one story). Each entry MUST show:
  - **Title** (short, descriptive)
  - **Blocked by** (other slices this depends on, by number; or "Nothing")
  - **Story covered** (the single user story from the PRD or grilling this slice delivers)
  - **Observable outcome** (the one behaviour this ticket leaves working)
  - **Acceptance criteria** (one to three Given/When/Then statements)
  - **Out of scope** (the nearest outcomes deliberately deferred)

  Quiz the operator on:
  - Is the granularity right? (Each slice should be individually deployable and cover a single user story.)
  - Are the dependencies correct?
  - Are any slices missing?

If feedback requires choosing among two or more viable breakdowns, compare them
through the delivery conductor's **Human decision brief** before asking.

Iterate based on operator feedback until the operator explicitly approves the ticket or the breakdown. **Write no draft files during this step.**

Apply this **small-context budget** to the single-ticket path and every proposed
slice:

- one user-visible outcome and one primary public contract or behaviour;
- one cohesive code area plus its tests, not several unrelated subsystems;
- one to three acceptance criteria from a single behaviour cluster;
- no independently deployable "and" outcome hidden in the title, story, or
  criteria;
- enough scope to be useful when merged, including the thin end-to-end path,
  but no speculative framework, broad cleanup, or second consumer.

If any check fails or the likely implementation needs a continuation session,
split again. Keep every result **vertically complete**. When uncertain,
recommend the smaller split. Do not create
frontend-only, backend-only, test-only, or "foundation" microtickets unless
that layer is itself a usable public contract.

Prefer independently deployable vertical slices. A wide refactor may use an
explicit **expand-contract exception** only when compatibility requires a
temporary two-phase change; name the expand slice, contract slice, compatibility
window, and rollback boundary instead of hiding both phases in one oversized
ticket.

### Step 8 — Emit drafts on approval

On explicit operator approval of the ticket (single-ticket path) or the slice breakdown (PRD-worthy or split-worthy path):

1. Dispatch `groom-writer` with a temporary staging directory inside the approved output directory:
   - The output directory (from Step 2).
   - The approved ticket content or slice breakdown.
   - The PRD content (if built) or a note that it was skipped.
   Before every write, require
   `bun "${FACTORY_ROOT}/scripts/groom-paths.ts" verify "<repoRoot>" "<path>"`.
   A rejection stops the run; never follow a symlink or path escape.

2. For each staged draft the writer emits, run structural verification:
   ```
   bun "${FACTORY_ROOT}/scripts/verify-ticket.ts" "<draft-file-path>"
   ```
   - **Non-zero exit** (missing section, zero or more than three acceptance criteria, more than one user story, or an acceptance criterion that is not a Given/When/Then statement): dispatch `groom-writer` again with the failing draft and the error output to fix and re-emit. A draft covering more than one story or behaviour cluster must be split into separate vertical tickets, not shortened by deleting required behaviour. Never write the failing draft as the final artifact. Loop until the draft passes.
   - **Zero exit (ok):** atomically move the verified draft to its final path.

3. Write the PRD (`prd.md`) into the output directory if one was synthesized.

### Step 9 — Ensure the grooming output directory is in .gitignore (idempotent)

Check whether the grooming output parent printed by `groom-paths.ts` already appears in `.gitignore`. If it does not, append that printed ignore path:

```
<grooming-output-parent>/
```

If it is already present, do nothing. Never add a duplicate entry.

### Step 10 — Closing summary

All human-facing output from this step passes through `sanitizeHumanText` (import from `scripts/human-text.ts`) to strip any em or en dashes.

Print a closing summary that includes:

1. **Output directory:** the directory printed by `groom-paths.ts`.
2. **Files written:** the list of draft filenames (and `prd.md` if written).
3. **Next steps:**
   - Review the drafts in the output directory.
   - Materialize each approved draft through the repository's confirmed
     work-item provider (`local-files` or an advertised remote provider).
   - Run `/draft <WORK-ITEM-REF>` for each item to begin the build phase.

### Step 11 — Invariants (asserted by this command)

- This command and its subagents (`groom-explorer`, `groom-writer`) hold **no** MCP, git, or work-item provider tools.
- A run of `/groom` makes **no commits** and **no remote work-item activity**.
- All generated artifacts (PRD and ticket drafts) land only under the grooming output directory — never elsewhere in the repo. The sole exception is the single idempotent `.gitignore` line added in Step 9.
- No draft with zero acceptance criteria is ever written as a final artifact.
- No draft with more than three acceptance criteria is ever written as a final artifact.
- No draft with a non-Given/When/Then acceptance criterion is ever written as a final artifact.
- Every approved ticket passes the small-context budget: one useful vertical outcome, one primary contract, one cohesive code area plus tests, and one to three criteria.
- The input shape is classified and recommended to the operator before the first grilling question (Step 4), and PRD synthesis and the vertical-slice breakdown (Steps 6 and 7) are conditional on that recommendation, not a default path.
- No groom output (PRD or ticket draft) contains an `Implementation decisions` or `Test seams` section, or any prose describing how the change is built or tested.
