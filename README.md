# Delivery skills

One SDLC conductor for **Cursor** and **Claude Code**. Clone this repository,
install once per host, and run `/delivery`.

The pack includes:

- `/delivery` — thin conductor, ledger, auto, retro, approval-gated improvement
- `/groom` `/draft` `/execute` `/address-comments` — portable factory (vendored from ig-spec, no Claude plugin required)
- `/code-review-max` `/mr-review` — dual-pass GitLab review
- `/openspec-archive` — post-merge OpenSpec archive

## Install

```bash
git clone https://gitlab.com/Sheikh.Ahmed1/delivery-skills.git
cd delivery-skills
./install.sh                 # Cursor + Claude Code
# ./install.sh --all         # also copies the Cloud Agent store when writable
# ./install.sh --cursor
# ./install.sh --claude
# ./install.sh --store       # Cursor Cloud Agent skill store
```

`--all` installs Cursor and Claude Code, then copies the Cloud Agent store if
that path is writable. On a Mac it skips `/cursor` instead of failing after
the desktop hosts are already linked.

Open a **new** chat on each host so the skills reload.

## Use

In the target repository:

```text
/delivery auto
/delivery help
```

`/delivery` invokes `/groom`, `/draft`, `/execute`, `/address-comments`,
`/code-review-max` or native `/code-review max`, `/mr-review`, and
`/openspec-archive`. It does not call `/ig-spec:*`.

## SDLC

`/delivery` is the only command to remember. It routes into the stage skills
below, records state in `runs/`, and stops for operator-owned decisions. Humans
own merge, archive, Jira status, and any live-skill install.

```mermaid
flowchart TD
  start["/delivery"] --> detect["Detect host and entry"]
  detect --> ledger["Reconcile ledger in runs/"]

  ledger --> discover["discover"]
  ledger --> triage["triage"]
  ledger --> groom["groom"]
  ledger --> draft["draft"]
  ledger --> execute["execute"]
  ledger --> review["review"]
  ledger --> address["address-comments"]
  ledger --> ship["ship"]
  ledger --> archive["archive"]
  ledger --> verify["verify"]
  ledger --> retro["retro"]
  ledger --> improve["improve"]

  discover -->|"operator yes on one-pager"| groom
  triage -->|"ready brief"| draft
  groom -->|"operator-approved slices"| draft

  draft --> assess["Assess ticket"]
  assess --> feasible["Feasibility"]
  feasible --> seams["Test-seam checkpoint"]
  seams -->|"operator yes"| openspec["Author OpenSpec, tests-first"]
  openspec --> drafted["Spec linked; wait for execute"]

  drafted -->|"typing execute is the build approval"| execute
  execute --> resume["Reconcile MR, tests, gates, dirty tree"]
  resume --> red["Write tests, prove red"]
  red --> green["Implement, prove green"]
  green --> holdout["Independent holdout review"]
  holdout -->|"approve"| mr["Open one MR"]
  holdout -->|"fix twice on same premise"| premise["State premise, one observation"]
  premise -->|"no third fix until then"| holdout

  mr --> review
  review --> maxPass["code-review-max or native code-review max"]
  maxPass --> mrReview["mr-review"]
  mrReview -->|"ready"| ship
  mrReview -->|"comments"| address
  address -->|"replay-safe threads"| review

  ship -->|"GO"| mergeWait["Human merges"]
  mergeWait --> archive
  archive -->|"operator yes"| verify
  verify --> retro
  retro -->|"accepted delivery lesson"| improve
  improve -->|"isolated candidate"| applyWait["Operator apply, reject, or rollback"]

  classDef human fill:#fff4ce,stroke:#8a6d1d
  classDef stop fill:#f3f3f3,stroke:#666
  class seams,drafted,mergeWait,applyWait human
  class start,ledger stop
```

Human-owned stops, in order:

1. Groom slice approval, then draft test-seam approval.
2. Typing `/delivery execute` is the approval to build.
3. Merge, then archive.
4. Installing or rolling back a delivery-skill candidate.

## Layout

```text
skills/           # what both hosts load
factory/          # gate scripts and subagent prompts
adapters/         # host notes, not a second copy of the skills
```

Self-improvement (`/delivery improve`) edits `skills/delivery` only, after
approval. Factory changes are ordinary commits in this repository.

## Tests

```bash
bun install --cwd factory
bun test factory/scripts
BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test skills/delivery/checks/delivery-specs.test.ts
```
