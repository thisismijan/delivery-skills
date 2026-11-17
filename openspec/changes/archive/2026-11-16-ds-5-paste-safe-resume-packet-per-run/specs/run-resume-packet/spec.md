## ADDED Requirements

### Requirement: One packet per run holds everything a new session needs
`factory/scripts/resume-packet.ts` (new) SHALL provide a `build <repo-root> <run-id>` mode that writes one Markdown file for the run and prints one JSON line on stdout with the keys `path` and `missing`, then exits 0. The state root SHALL be resolved by `resolveStateRoot` in `factory/scripts/improvement-state.ts`, so `DELIVERY_STATE_ROOT` applies as it does for the other run state. The script SHALL read the run ledger at `<state-root>/runs/<run-id>.md` and the frozen run contract at `<state-root>/runs/<run-id>.run-contract.json`, and SHALL write the packet to `<state-root>/packets/<run-id>.md`, replacing any earlier packet for that run. The invocation SHALL be exported as `RESUME_PACKET_BUILD_INVOCATION` with the value `scripts/resume-packet.ts build <repo-root> <run-id>`.

The packet SHALL start with the title line `# Resume packet: <destination>`, where the destination is the ledger's title line, or the run id when there is no ledger. It SHALL then carry these two fixed lines, a line `- Run id: <run-id>`, and a line `- Known by: <ids>` taken from the ledger's `Ids:` header, or the run id when there is no ledger or no such header. When the detector in the withholding requirement withholds the ledger's title, the title line SHALL read `# Resume packet: <run-id>`; when it withholds the ids, the line SHALL read `- Known by: withheld because it may carry a secret`. The run id is safe to write because the script's own id rule (the pattern `ledger-store.ts` uses, letters, digits, and hyphens) is applied before anything is read. No line of the packet SHALL start with `Ids:`, so the ledger lookup by header never matches a packet.

- `Left out on purpose: the ledger's approvals, verdicts, stops, lessons, and header fields other than its title and ids; the run contract's approval block; non-Markdown files in a change folder; and environment variables.`
- `Lines that may carry a secret are withheld and shown as MISSING lines. Every other line is copied as written.`

The packet SHALL then carry these second-level headings, spelled exactly as written and in this order: `## Missing pieces`, `## Run contract`, `## Current status`, `## Next command`, `## Decisions so far`, `## Acceptance criteria`, `## Change files`. Every heading SHALL be present in every packet. The six pieces are filled as follows.

- Run contract: the run id, plan version, level (`standard` when the contract records none), goal, scope, non-goals, each ticket's key, title and blockers, the human-owned actions, the permitted writes, the supersedes hash, reason and affected invariant when present, the constitution hash, and the contract hash. The contract SHALL be read with `parseFrozenRunContract` in `factory/scripts/sdlc-constitution.ts`, so its hash is checked against its body.
- Current status: for each row of the ledger's Keys table, the key, title, status tag, stage, change, and blockers exactly as recorded. A parser in `factory/scripts/resume-packet.ts` reads the table. It requires the columns Key, Title, Stage, MR, Blocked by, and Status, refuses a row whose cell count differs from the header's, never quotes a cell or a row in an error message (it names the problem, the column, or the row number), and splits cells on a pipe that is not escaped with a backslash, turning `\|` into `|`, as `cells` in `factory/scripts/next-action.ts` does.
- Next command: for each key with a status, the result of `selectNextAction` in `factory/scripts/next-action.ts` called with the key as the entry and the recorded status tag. A `run` result SHALL be written as `/delivery <key>` with the line `next step: <verb>`. Any other result (`stop`, `wait`, or `escalate`) SHALL be written as `no command to type yet: <reason>` using the selector's own reason. A key that starts with `discover-` is a discovery run. The selector cannot classify such an entry, because `classifyEntry` reads `discover-<yyyy-mm-dd>-<slug>` as a command word with no argument and answers that it is not a known delivery command. For that key only, the script SHALL pass the fixed stand-in entry `DISCOVER-0` to `selectNextAction` with the recorded status tag, so the step still comes from the selector's own status lookup. A `run` result whose verb is `discover` SHALL be written as `/delivery discover <key>` with the line `next step: discover`. A `run` result with any other verb, such as `groom` for a `[discovered]` key, SHALL be written as `no command to type yet: the next step is <verb> and its input is the approved one-pager the ledger names`, with the line `next step: <verb>`. Any other result is written like any other key, with the selector's reason.
- Decisions so far: every bullet line of the ledger's `## Decisions` section, in order, or `None recorded yet.` when the section has no bullet.
- Acceptance criteria: for each ticket in the run contract, its key and its acceptance criteria.
- Change files: for each key, the path of its change folder, then every Markdown file under that folder in sorted order, each under its folder-relative path as a third-level heading with its text in a code fence made by `fence` in `factory/scripts/review-packet.ts`, so a file that contains a fence cannot close the packet's fence. The folder SHALL be found with `findChange` in `factory/scripts/find-change.ts` over the entries of `openspec/changes/` in the repository root, so one key cannot select another key's folder. When no entry matches there, the script SHALL look in the key's worker worktree, because the coordinator drafts and builds each in-flight key there and the repository root holds no change folder for it. The worktree directories tried, in order, are the path recorded by the latest Decisions line of the form `dispatched <key> to <path>` (written by the fan-out step in `skills/delivery/workflows/auto.md`), when it is an existing absolute directory, and `<state-root>/worktrees/<key>` under the state root from `resolveStateRoot`. In each, `findChange` runs over the entries of `openspec/changes/`. No function in the repository creates or returns a worker worktree path (`factory/scripts/worktree-close.ts` only receives one), so these two sources are the only ones the packet can read, and it reads only `openspec/changes/` there. When no entry matches in any of those, the script SHALL look again with `findChange` over the entries of `openspec/changes/archive/` with the leading `yyyy-mm-dd-` removed from each name, and use the archived folder when exactly one matches, so a key whose change was archived is not reported missing. The first lookup with exactly one match wins; several matches in one place is a gap. The script SHALL write nothing outside its own packet file. `findChange` and `factory/scripts/find-change.ts` are not changed. A key that starts with `discover-` has no change folder and SHALL NOT be looked up. A key `findChange` refuses SHALL be a gap with its message, never a crash.

#### Scenario: A complete run gives a complete packet
- **GIVEN** a repository whose `.gitignore` was produced by `withDeliveryIgnores`, a run with a ledger holding a Decisions section and a Keys row with a status, a valid frozen run contract, and one change folder for the key, where the Decisions lines and the change files also carry ordinary repository paths such as `skills/delivery/workflows/delivery`, a slash-joined word list, a kebab-case change name of more than 24 characters that contains a digit, and a `sha256:` prefixed hash of 64 lowercase hexadecimal characters
- **WHEN** `resume-packet.ts build <repo-root> <run-id>` runs on it
- **THEN** it exits 0 and prints a `path` that ends in `packets/<run-id>.md` and an empty `missing` list
- **AND** the file at that path holds the two fixed lines, the seven headings in the stated order, the contract's goal, hashes and ticket keys, the status tag from the Keys row, the next command, every decision line, every acceptance criterion, and the text of each Markdown file of the change folder, including every line that carries one of those paths, names, or hashes
- **AND** the `## Missing pieces` section reads `None.`
- **AND** no line of the packet starts with `Ids:`
- **AND** `git check-ignore` reports the packet path as ignored
- **AND** after the ledger's status changes, building again replaces the file at the same path with the new status

#### Scenario: The next command comes from the existing selector
- **GIVEN** a ledger with one key tagged `[drafted]`, a second key tagged `[groomed]`, which `selectNextAction` cannot advance without blocker evidence, a third key tagged `[triage: wont-fix]`, and three discovery run keys that start with `discover-` tagged `[discovering]`, `[discovered]`, and `[stopped: operator stopped]`
- **WHEN** the packet is built
- **THEN** the first key reads `/delivery <key>` and the line `next step: execute`, and the second and third read `no command to type yet:` followed by the reason `selectNextAction` returns for each
- **AND** the `[discovering]` key reads `/delivery discover <key>` with `next step: discover`, the `[discovered]` key reads `next step: groom` and `no command to type yet:` with the one-pager wording, and the stopped discovery key reads `no command to type yet:` followed by the selector's reason for a stopped status
- **AND** the build exits 0 and each discovery key's change files are named missing with the reason that a discovery run has no change folder

### Requirement: A missing piece is named, never dropped
When a piece cannot be filled, or part of it is withheld, the packet SHALL still carry its section and SHALL put one line in that section for each gap in the form `MISSING: <piece>: <reason>`. The `## Missing pieces` section SHALL repeat the same lines, or read `None.` when there are none. The `missing` list on stdout SHALL hold one entry per such line, written as the piece name. The piece name is one of `run contract`, `current status`, `next command`, `decisions so far`, `acceptance criteria`, `change files`, `title`, or `ids`, followed by ` for <key>` when the gap belongs to one key. The `title` and `ids` gaps have no section: they are shown by the packet's title line and `Known by` line and listed under `## Missing pieces`. The reasons SHALL be plain sentences, and where a parser or the key lookup gave the reason, its own message SHALL be used, unless it is withheld by the rule in the next requirement. A gap SHALL NOT stop the build: the packet is written and the script exits 0. The gaps are these.

- The run contract file is absent, or fails `parseFrozenRunContract` for any reason, including a hash that does not match its body or a contract frozen under an older constitution. This is the gap `run contract`, and it also makes `acceptance criteria` a gap, with the reason that the run contract is needed.
- The ledger file is absent, it has no Keys table, its Keys table cannot be read, or the table has no rows. This makes `current status` and `next command` gaps. A ledger that is absent also makes `decisions so far` a gap, as does a ledger with no `## Decisions` heading.
- A Keys row has an empty status or `-`. This makes `current status for <key>` and `next command for <key>` gaps.
- The keys used for change files are the ledger's keys, or the run contract's ticket keys when the ledger's keys cannot be read. When neither can be read, `change files` is a gap. For a key, `change files for <key>` is a gap when no change folder matches in the repository root, a worker worktree, or the archive folder, when several match (the reason names them), when the matching folder holds no Markdown file, when the key is a discovery run, or when the lookup refuses the key.
- A line or field is withheld by the rule in the next requirement. The gap is named for the piece the text belongs to.

#### Scenario: A run without a usable contract names the contract and the criteria
- **GIVEN** a run with a complete ledger and change folder, once with no run contract file and once with a run contract file whose body was edited after it was frozen
- **WHEN** the packet is built for each
- **THEN** both builds exit 0 and write a packet with all seven headings
- **AND** the `## Run contract` and `## Acceptance criteria` sections each hold a `MISSING:` line, the `## Missing pieces` section repeats both lines, and the `missing` list on stdout is `run contract` and `acceptance criteria`
- **AND** for the edited contract the reason is the parser's message that the hash does not match
- **AND** the current status, next command, decisions, and change files are filled in

#### Scenario: A run without a readable ledger names the ledger pieces
- **GIVEN** a run with a valid run contract, a change folder for the contract's ticket, and no ledger file, and a second run whose ledger has a Keys table with a malformed row and no Decisions heading
- **WHEN** the packet is built for each
- **THEN** both builds exit 0
- **AND** for the run with no ledger, `current status`, `next command`, and `decisions so far` are named as missing, the run contract and acceptance criteria are filled in, and the change files are looked up from the contract's ticket keys
- **AND** for the second run, `current status`, `next command`, and `decisions so far` are named as missing with the table's own error message for the first two, and the run contract is filled in

#### Scenario: A key with no status or no change folder is named by key
- **GIVEN** a ledger with two keys, one with an empty status cell and no change folder in the repository root, a worker worktree, or the archive folder, and one with a status and two change folders whose names both start with its key
- **WHEN** the packet is built
- **THEN** the build exits 0 and the `missing` list holds `current status for <key>`, `next command for <key>`, and `change files for <key>` for the first key, and `change files for <key>` for the second key with a reason that names both folders
- **AND** no change file text from either folder is copied

#### Scenario: An archived change is found and an escaped pipe in a title is read
- **GIVEN** a ledger whose Keys title cell contains an escaped pipe, and a key whose only change folder is `openspec/changes/archive/<yyyy-mm-dd>-<change name>`
- **WHEN** the packet is built
- **THEN** the build exits 0, the Keys row is read as one row with its title written with a plain pipe, and the `missing` list holds no entry for that key's change files
- **AND** the packet holds the archived folder's path and the text of its Markdown files

#### Scenario: A change in a worker worktree is found without writing there
- **GIVEN** two in-flight keys whose repository root holds no change folder, one with a Decisions line `dispatched <key> to <path>` naming a worktree directory that holds `openspec/changes/<change name>/`, and one with no such line whose change sits in `<state-root>/worktrees/<key>/openspec/changes/<change name>/`
- **WHEN** the packet is built
- **THEN** the build exits 0, the `missing` list holds no entry for either key's change files, and the packet holds the text of both changes' Markdown files
- **AND** no file under either worktree, and no file other than the packet, is created or changed

#### Scenario: A run that exists nowhere, or an unsafe run id, is refused
- **GIVEN** a run id with neither a ledger nor a run contract, and a run id that contains a path separator or does not match the ledger's file-safe id pattern
- **WHEN** `build` runs on each
- **THEN** each exits 1 with a message that names the run id or says the id is invalid, and no packet file is written
- **AND** a missing or extra argument exits 2 with the usage line

### Requirement: The packet is paste-safe by withholding
The packet SHALL NOT carry a secret or a credential that the rule below can see, and SHALL NOT promise more than that. The script SHALL take its content only from the pieces listed above, so it SHALL NOT copy the ledger's header fields other than its title and `Ids:`, its Approvals, Verdicts, Stops, and Lessons sections, the `approval` block of the run contract, environment variables, lock owner records, worker journals, gate or evidence files, `.delivery.json`, or any file in a change folder that is not Markdown.

Every other piece of text the script copies, and every reason it would show, is checked by a detector defined in `factory/scripts/resume-packet.ts` itself, which SHALL NOT import or export the secret patterns of `factory/scripts/provider-error.ts`, `factory/scripts/note-publication.ts`, or any other script. The checked text is each Decisions line, each Keys row, the ledger title and ids, the contract's goal, each scope and non-goal item, each ticket title, each acceptance criterion, the supersedes reason and affected invariant, each line of each change file, and every reason that came from a parser, a schema message, an error of `factory/scripts/sdlc-constitution.ts`, or the key lookup. The values the script writes itself (the run id, keys, plan version, level, the contract and constitution hashes, the path lines, and its own fixed sentences) are not checked. The Keys parser's messages are fixed sentences that name the problem, a column from the fixed column list, or a row number, and never quote a cell or row. A line is suspicious when any of these holds, with letters compared without case unless stated.

- It has a word, made of letters, digits, underscores, and hyphens, that contains `token`, `secret`, `passw`, `passphrase`, `pwd`, `credential`, `auth`, `api_key`, `apikey`, or `api-key`, or that is exactly `key`, followed, after an optional closing quote and optional spaces, by a colon or an equals sign. Underscores and hyphens are part of the word, so `DB_PASSWORD=`, `AWS_SECRET_ACCESS_KEY=`, `apiKey:`, `X-API-Key:`, `passphrase=`, `?key=`, and a quoted JSON key such as `"password":` all count.
- It has user info before an at sign in a URL, that is `scheme://` followed by characters other than whitespace, a slash, or an at sign, and then an at sign. A token alone as user info counts.
- It has a private key marker line, `-----BEGIN` followed by text containing `PRIVATE KEY` and then `-----`. This covers the RSA, EC, DSA, OpenSSH, encrypted, and PKCS#8 forms and `BEGIN PGP PRIVATE KEY BLOCK`.
- It has a known token prefix at the start of a word, meaning not directly after a letter or a digit, compared with case: `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_`, `github_pat_`, `glpat-`, `glrt-`, `gldt-`, `glptt-`, `gloas-`, `xox`, `sk-`, or `AKIA`.
- It has an unbroken run of 32 or more characters from `A-Z`, `a-z`, `0-9`, and `+` (run rule A), unless the run is exactly 64 lowercase hexadecimal characters directly after `sha256:`. A slash, dot, or hyphen ends a run, so a repository path, a slash-joined word list, and a kebab-case name are not caught by this rule.
- It has an unbroken run of 24 or more characters from `A-Z`, `a-z`, `0-9`, `_`, and `-` that contains at least one digit, at least one uppercase letter, and at least one lowercase letter (run rule B). A run ends at a slash, a dot, or any character outside that set. The uppercase and lowercase requirement is stricter than a digit and a letter alone, because a kebab-case change name with a digit is all lowercase and must not be withheld. A Google style `AIza` key of 39 characters has all three and is caught.

When a line or field is suspicious, the script SHALL withhold the whole of it and write in its place `MISSING: <piece>: withheld because it may carry a secret; read it in <source>`, where the source is `the ledger`, `the run contract`, or `the change file`. A reason that is suspicious SHALL be replaced by the fixed text `reason withheld because it may carry a secret`, so the line reads `MISSING: <piece>: reason withheld because it may carry a secret`. A private key marker line also withholds every following line through its `-----END` line, or to the end of that file or section when there is no end line, as one withheld block with one `MISSING:` line. A suspicious Keys row is withheld as a whole, which makes `current status for <key>` and `next command for <key>` gaps. A withheld title or ids value is handled as the first requirement says, and is listed as the gap `title` or `ids`. There SHALL be no partial redaction, so no part of a withheld line or field is written. Change files use this same per-line rule, and none is listed by path alone, because withholding single lines keeps every line that is safe and needs no separate whole-file rule. The source ledger, contract, and change files SHALL NOT be changed.

#### Scenario: Each detector withholds its whole line
- **GIVEN** a ledger whose Decisions section holds one clean line and one line for each of these planted values, each with its own surrounding words: `DB_PASSWORD=` with a value, a JSON fragment with a quoted `"password"` key, an `Authorization: Bearer` line with a JWT, `apiKey:`, `X-API-Key:`, `passphrase=`, a `?key=` query in a link, a `ghs_` token, a `glrt-` token, an `AKIA` access key id, an `AIza` style key of 39 characters with no key word, a URL whose only user info is a token, an unbroken 40 character base64 run with no key word, a bare run of 64 lowercase hexadecimal characters, and a PGP private key block of several lines
- **WHEN** the packet is built
- **THEN** every planted value is absent from the file, each suspicious line, and the whole private key block, is replaced by one `MISSING: decisions so far: withheld because it may carry a secret; read it in the ledger` line, and the clean line is copied as written
- **AND** the `missing` list on stdout holds `decisions so far` once for each withheld line or block, and the `## Missing pieces` section repeats each `MISSING:` line
- **AND** the source ledger still holds its original text

#### Scenario: The same rule covers every other copied field and the change files
- **GIVEN** a run with a planted `password=` value in the contract's goal, one in a scope item, one in a ticket's acceptance criterion, one in a Keys title, one in the ledger's title line, one in its `Ids:` line, and one on a line of a change file that also has clean lines
- **WHEN** the packet is built
- **THEN** none of the planted values appears in the packet
- **AND** the goal, scope item, and acceptance criterion are each replaced by a `MISSING:` line naming `run contract` or `acceptance criteria for <key>` with the reason `read it in the run contract`, the Keys row is withheld with `current status for <key>` and `next command for <key>` named missing, and the change file's one line is replaced by a `MISSING: change files for <key>` line with the reason `read it in the change file` while its clean lines are copied
- **AND** the title line reads `# Resume packet: <run-id>`, the `Known by` line reads `- Known by: withheld because it may carry a secret`, and the `missing` list holds `title` and `ids`
- **AND** the source files still hold their original text

#### Scenario: A reason that carries text is withheld too
- **GIVEN** a run contract frozen under an older constitution whose human-owned list holds an extra string with a planted `api_key=` value, so that the parser's message quotes it, and a ledger whose Keys table has a malformed row that holds a planted `password=` value
- **WHEN** the packet is built
- **THEN** neither planted value appears in the packet, the `run contract` gap line reads `MISSING: run contract: reason withheld because it may carry a secret`, and the `current status` gap line carries a message that names the row number and does not quote the row

#### Scenario: Fields that can carry secrets are never copied
- **GIVEN** a run whose ledger has a `Target repo:` line, an Approvals entry, a Stops entry, and a Lessons entry, whose contract approval block holds the operator's words, and whose change folder holds a `.delivery.json` and a non-Markdown file, each carrying a plain sentinel string that matches no suspicious shape
- **WHEN** the packet is built
- **THEN** none of the sentinel strings appears in the packet

#### Scenario: The preamble states only what the packet does
- **GIVEN** any packet the script builds, complete or with gaps
- **WHEN** its first lines are read
- **THEN** they contain, exactly, the `Left out on purpose:` line and the `Lines that may carry a secret are withheld` line given above
- **AND** the packet contains neither the text `[redacted]` nor any sentence that says the text is free of secrets or clean

### Requirement: Status names where the packet is
`resume-packet.ts` SHALL provide a `where <repo-root> <run-id>` mode that prints one JSON line with `path`, the same path `build` writes, and `exists`, a boolean for whether a file is there now. It SHALL write nothing, exit 0, and apply the same run id check as `build`, exiting 1 for an unsafe id. The invocation SHALL be exported as `RESUME_PACKET_WHERE_INVOCATION` with the value `scripts/resume-packet.ts where <repo-root> <run-id>`. In `skills/delivery/SKILL.md`, the status entry (the section under the `### Entry S` heading, titled Status) SHALL tell the conductor to run `bun "${FACTORY_ROOT}/scripts/resume-packet.ts" where <repo-root> <run-id>`, report the path it prints, and say that no packet has been written yet when `exists` is false. The status entry SHALL NOT run `build`, so status stays read-only.

#### Scenario: Where reports the path and whether a packet exists
- **GIVEN** a run with a ledger and no packet
- **WHEN** `where` runs, then `build` runs, then `where` runs again
- **THEN** the first `where` prints a `path` ending in `packets/<run-id>.md` with `exists` false and creates no file, and the last prints the same `path` with `exists` true
- **AND** the `path` equals the `path` that `build` printed
- **AND** an unsafe run id makes `where` exit 1

#### Scenario: The status entry names the packet location and stays read-only
- **GIVEN** the status entry of `skills/delivery/SKILL.md` (the section under the `### Entry S` heading, titled Status)
- **WHEN** it is read
- **THEN** it contains `RESUME_PACKET_WHERE_INVOCATION` in its `bun "${FACTORY_ROOT}/..."` form, tells the conductor to report the printed path, says that no packet has been written yet when none exists, and does not contain the `build` invocation

### Requirement: The conductor writes the packet at stage boundaries
In `skills/delivery/SKILL.md`, the `## Stage boundaries` section SHALL tell the conductor to write the run's resume packet with `bun "${FACTORY_ROOT}/scripts/resume-packet.ts" build <repo-root> <run-id>` before it chooses Clear, a Fan-out brief, or compaction, and to give the new session that file. It SHALL say that an isolated worker (one with `DELIVERY_WORKER_JOURNAL` set) never writes the packet, because it must not read the run ledger. `skills/delivery/workflows/delivery-ledger.md` SHALL list `packets/<run-id>.md` under the state root in its Location section, and SHALL say the packet is a derived copy that never replaces the ledger as the source of truth.

#### Scenario: The conductor and the ledger describe the packet
- **GIVEN** the `## Stage boundaries` section of `skills/delivery/SKILL.md` and the Location section of `skills/delivery/workflows/delivery-ledger.md`
- **WHEN** they are read
- **THEN** the stage boundaries section contains the `build` invocation in its `bun "${FACTORY_ROOT}/..."` form, names Clear, Fan-out brief, and compaction, and names `DELIVERY_WORKER_JOURNAL` as the case where a worker does not write it
- **AND** the ledger's Location section contains `packets/<run-id>.md`, and says the packet is a derived copy and the ledger is the source of truth
