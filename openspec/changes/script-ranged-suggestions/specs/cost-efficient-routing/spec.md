## MODIFIED Requirements

### Requirement: A suggestion fence does not start the comment implementer

When `/address-comments` actions a comment whose body is only a suggestion fence on a new-side line inside the repository, it SHALL apply that span with `forge-comments.ts apply-suggestion` and SHALL NOT dispatch the implementer for that fix. An optional `:-N+M` header SHALL replace from N lines before the anchor through M lines after it. A bug comment SHALL still get its red test first, and every gate and holdout SHALL still run. Any comment the helper cannot prove SHALL keep the implementer.

#### Scenario: A suggestion fence is applied by script
- **WHEN** an action comment is only a suggestion fence on a new-side line of a repository file
- **THEN** the named span is replaced with the suggested text
- **AND** no implementer is dispatched for that fix
- **AND** the green gate, lint, typecheck, and holdout still run

#### Scenario: Anything else keeps the implementer
- **WHEN** the comment has extra prose, a range that leaves the file, an old-side or missing anchor, or a path outside the repository
- **THEN** the helper reports `model` and writes nothing
- **AND** the implementer handles the fix as before
