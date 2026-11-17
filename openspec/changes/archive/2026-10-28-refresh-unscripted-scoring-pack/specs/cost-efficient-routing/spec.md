## ADDED Requirements

### Requirement: The unscripted mechanical pack matches remaining worker units

The representative unscripted mechanical pack SHALL include units that
`apply-mechanical-edit.ts` cannot prove, including a Python attribute of
the same name, `exec` or `eval`, `serialVersionUID`, and a repo formatter
that changes names or literals. It SHALL NOT include units whose apply
result is `script`.

#### Scenario: Remaining refusals are in the pack
- **WHEN** the unscripted pack is listed
- **THEN** it includes a Python attribute rename, an exec use, a
  `serialVersionUID` field, and a formatter that changes names

#### Scenario: Scripted missing imports stay out
- **WHEN** the unscripted pack is listed
- **THEN** it does not include a unique Python or Java missing import
