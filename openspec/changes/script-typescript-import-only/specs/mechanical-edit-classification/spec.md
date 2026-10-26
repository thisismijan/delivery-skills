## ADDED Requirements

### Requirement: TypeScript import-only units apply through organize-imports

When a mechanical-edit unit is TypeScript import-only, the command SHALL apply language-service organize-imports on the listed files only when every text change sits inside import declarations. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused TypeScript imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a TypeScript file whose unused named import can be removed without touching later statements
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A non-import rewrite is refused
- **WHEN** organize-imports would change code outside import declarations
- **THEN** the helper writes nothing and reports `apply: select-model`
