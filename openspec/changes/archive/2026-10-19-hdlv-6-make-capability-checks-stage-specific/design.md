## Context

The capability checks exist only as prose in `skills/delivery/SKILL.md`. Phase 1 step 4 says `auto` checks every capability once up front, and a spec test pins that sentence. The Jira row says reading the ticket must succeed, but nothing executes it, so a stage can treat the Atlassian connection as ready without a read. Complexity is low: a small pure function plus prose edits.

## Goals / Non-Goals

**Goals:**
- Block a stage only on the capabilities it needs.
- Re-check at each stage boundary.
- Make the Jira check a real read that cannot succeed without being called.

**Non-Goals:**
- Credential remediation, installing tools, or changing merge and Jira ownership.
- Probing real hosts in tests.

## Decisions

### Approved test seam: `checkCapabilities(stage, probes)`

A pure function in `skills/delivery/checks/capabilities.ts`. It reads the `Needed by` column of the Capabilities table in `skills/delivery/SKILL.md`, selects the capabilities the stage needs, runs only those injected probes, and returns per-capability results plus a stop decision naming the capability, the stages it blocks, and its fix. A stage runs the check when it begins, so each boundary is a fresh call.

This is the highest stable seam that proves the behaviour: it is executable, public, and takes the real table as input. The table stays the source of truth and is parsed, never copied into the code.

**Catches:**
- a later-stage capability (deployed environment, skill evaluation) failing during an early stage, which must not block it;
- Jira failing when the stage needs it, which must stop the stage;
- Jira reporting success without a real read, caught by a probe that returns no ticket;
- a capability needed by the next stage being skipped, caught by calling the check at each stage start;
- table drift: a `Needed by` entry that is not a real verb, or a missing fix text.

**Misses:**
- whether a live Atlassian, glab, or openspec connection works on a real host;
- whether the model follows the skill prose at run time;
- differences between the Mac, a self-hosted worker, and a cloud agent.

**Controlled fakes:**
- one fake probe per capability that can pass, fail, or claim success without a read;
- a fake Jira reader that records whether it was called, so hard-coded success shows as zero calls;
- a recording probe runner that counts calls per stage, to prove the re-check;
- the real `SKILL.md` table is used as input, with no fake.

The existing wording tests remain as guards. The test that pins "check them all once" is rewritten to assert per-stage checking, not weakened.

### Jira probe contract

The Jira probe is injected and must return the ticket it read. The check treats a result with no ticket key, or a probe that was not called, as a failure. Real hosts supply a probe that reads the current ticket through the Atlassian connection.

### Alternatives considered

- Keep the prose only and extend text tests: rejected, it cannot prove a Jira read happened or that a later capability does not block.
- Check all capabilities but warn on later ones: rejected, the ticket asks for the current stage to block only on what it needs, and unneeded probes cost time and can fail on unrelated hosts.

## Risks / Trade-offs

- Prose is run by a model, so the executable check proves the rules while the skill text must still tell the stage to call it. Wording tests cover that.
- Removing the up-front table removes an early warning. This is intended.
- The Jira probe differs per host. The contract is only that it returns the ticket it read.
