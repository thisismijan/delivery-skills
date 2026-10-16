## Context

`commit-guard.ts` already exports `isForbiddenMutation` and runs as a Claude Code `PreToolUse(Bash)` hook. It only sees Bash command text, has no API-call rules, and Cursor has no executable counterpart. `gl-note` publishes review notes but the factory note path can bypass it. Complexity signal: medium.

## Goals / Non-Goals

**Goals:** one set of pure decisions shared by every host; a closed, tested deny list; fail closed everywhere a decision cannot be made.

**Non-Goals:** automating merge or Jira transitions; changing human ownership; defeating deliberately obfuscated commands (the guard is a defence layer, not proof of enforcement).

## Decisions

### Approved test seams

All seams are pure functions in `factory/scripts`, tested with `bun test`. Preference was given to the existing `commit-guard` seam and to the highest stable public entry points.

1. **`decideCommand(command: string): { blocked: boolean; reason?: string }`** (extends `isForbiddenMutation`).
   - Catches: existing merge, close, force-push, hard reset and Jira cases; `glab api` with a mutating method on a merge request merge or close; `gh api` or `gh pr merge|close`; `curl` with a mutating method against a Jira transition, issue edit or issue create endpoint; force refspecs (`--force`, `-f`, `--force-with-lease`, `--force-if-includes`, `+refspec`); GET reads that must stay allowed.
   - Misses: obfuscated commands (command substitution, wrapper scripts, aliases) and non-Bash tools. Documented as out of scope, not tested.
   - Controlled fakes: none (string in, decision out).
2. **`checkNotePublication({ bodyPath, repoRoot, content }, deps): { allowed: boolean; reason?: string }`**
   - Catches: paths outside `.review/` including `../` traversal and absolute paths; symlink escape; secret-bearing names (`.env`, `*.pem`, `id_rsa*`, `credentials*`); secret-like content (token prefixes, private key headers).
   - Misses: novel secret formats and semantic secrets in prose.
   - Controlled fakes: injected `realpath` and `readFile` in `deps`, so no real filesystem. `gl-note` is covered only for calling the check before any network call, using a recording fake `glab` runner.
3. **`canStartStage({ stage, host }): { allowed: boolean; reason?: string }`**
   - `host` is `{ name, mutationEnforcement: "enforced" | "unenforced" | "unknown" }`. Stage mutability comes from one stage table.
   - Catches: mutating stage on an unenforced or unknown host is denied; read-only stages allowed anywhere; missing capability fails closed; unknown stage fails closed.
   - Misses: whether a host's hook really fires. That needs a per-host integration check outside the unit seam.
   - Controlled fakes: host capability fixtures for Claude Code (enforced), Cursor (unenforced), and unknown.
4. **Hook adapter round trip.** One test feeds a Claude Code `PreToolUse` JSON payload to the entry point and checks the deny output.
   - Catches: malformed or missing-command payloads deny; `decideCommand` is wired in; deny output shape.
   - Controlled fakes: stdin only.

### Closed deny list

Merge and close via `glab mr`, `gh pr`, and API equivalents; Jira create, edit and transition (tool names and REST endpoints); force pushes by flag or `+` refspec; `git reset --hard`. Mutating HTTP methods only: reads are allowed.

### Policy

Cursor is declared `unenforced`, so its mutating stages stay blocked until a real enforcement hook exists and the declaration is changed with a test. Claude Code is `enforced`. A host that declares nothing is `unknown` and treated as unenforced.

### Alternatives considered

- Prose-only rules on Cursor: rejected, it is the current gap.
- Regex only on the whole command string without method awareness: rejected, it would block legitimate GET reads.

## Risks / Trade-offs

- Indirection evades text matching. Mitigation: documented limit, plus the stage gate and jailed publisher as independent layers.
- Secret detection false positives. Mitigation: an explicit, tested pattern list.
- Existing guard fails open on a missing command field. Mitigation: the adapter denies a payload with no command string.
