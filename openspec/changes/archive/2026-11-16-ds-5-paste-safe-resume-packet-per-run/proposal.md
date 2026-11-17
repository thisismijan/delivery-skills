## Why

The state of a run is spread over the run ledger, the frozen run contract, the decisions, the acceptance criteria, and the change files. A new session has to find and read each one, and it has no way to tell a piece that is absent from a piece it simply has not found. A run therefore leans on the memory of the session that started it, which the delivery constitution forbids (`durable-resume`).

## What Changes

- Add a script that builds one resume packet per run: a single Markdown file a new session can be handed on its own
- The packet holds six pieces under fixed headings: the run contract, the current status, the next command, the decisions so far, the acceptance criteria, and the change files
- When a piece is missing or unusable, the packet says so in its own section and in a `Missing pieces` list, instead of leaving the piece out
- A discovery run gets the selector's next step and a named gap for change files, and a change is found in the repository, the key's worker worktree, or the archive folder
- The packet is paste-safe by withholding: it leaves out the fields most likely to carry a secret, and any other line that looks like it may carry one is withheld whole and shown as a missing piece, never partly redacted
- The packet is written under the run state folder, which is gitignored, so it never reaches version control
- `/delivery status` names where the run's packet is, using a read-only mode that writes nothing
- The conductor writes the packet at each stage boundary, before it chooses to clear the session, hand work to a fan-out brief, or compact

## Capabilities

### New Capabilities

- `run-resume-packet`: the resume packet script, its section layout, how a missing piece is named, what is excluded or withheld, and where the conductor writes it and names it

### Modified Capabilities

None. The ledger format, the run contract format, and the next-step table are read as they are and not changed.

## Out of Scope

- Resuming a run automatically from the packet
- Changing the format of the ledger or the run contract
- Sharing or publishing the packet outside the local run
- Copying the ledger's stops, verdicts, approvals, or lessons into the packet

## Impact

- `factory/scripts/resume-packet.ts` (new) builds the packet and reports its location
- `factory/scripts/resume-packet.test.ts` (new) runs the script on fixture runs and reads the skill wording
- `factory/scripts/review-packet.ts` exports `fence` and `specSections`, with no change in behaviour
- `skills/delivery/SKILL.md` gains the status wording in Entry S and the packet step in Stage boundaries
- `skills/delivery/workflows/delivery-ledger.md` states that the packet is a derived copy and the ledger stays the source of truth
