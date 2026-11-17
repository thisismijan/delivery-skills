## MODIFIED Requirements

### Requirement: A scripted mechanical-edit unit does not start execute workers

When `/execute` applies a mechanical-edit unit and `apply` is `script`, it SHALL NOT dispatch the test-writer or the implementer, and SHALL NOT run a red gate. It SHALL still run green, lint, and typecheck, then holdout. A unit that is not scripted SHALL keep tests-first and the implementer.

#### Scenario: Scripted apply skips the test-writer
- **WHEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** no test-writer is dispatched
- **AND** no red gate runs
- **AND** no implementer is dispatched
- **AND** green, lint, typecheck, and holdout still run

#### Scenario: An unscripted unit keeps tests-first
- **WHEN** the unit is `not-mechanical` or `apply` is `select-model`
- **THEN** the test-writer, red gate, and implementer still run

#### Scenario: A JavaScript rename is applied by script
- **WHEN** the listed files are JavaScript and the rename is proven
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** no test-writer or implementer is dispatched

### Requirement: An acknowledgement-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only acknowledgements such as LGTM, thanks, approved, or done, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An acknowledgement skips the assessor
- **WHEN** a remaining comment body is only acknowledgements
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Mixed acknowledgements still use the assessor
- **WHEN** the body contains an acknowledgement and other review text
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: Named safety-sensitive work does not start a feasibility analyst

When `/draft` finds authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration named in What to build or Acceptance criteria, it SHALL write a `needs_human` feasibility verdict and SHALL NOT dispatch the feasibility-analyst. A complete ordinary ticket SHALL skip the analyst as feasible at medium complexity. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: Named authentication skips the analyst
- **WHEN** What to build or Acceptance criteria names authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `needs_human`

#### Scenario: Ordinary tickets still use the analyst
- **WHEN** those sections do not name authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration
- **AND** Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one feasibility-analyst is dispatched
