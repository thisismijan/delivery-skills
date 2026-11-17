## ADDED Requirements

### Requirement: Java method renames apply through a proven script

When a mechanical-edit unit is a Java method rename, the command SHALL apply it only when the listed files contain exactly one method declaration of the source name, no type declaration of that name, every remaining identifier token lives in those files, and the target name is unused. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A complete Java method rename is applied without a worker
- **WHEN** a mechanical rename unit lists every Java file that references the method, the listed files contain one method declaration of that name, and the target name is unused
- **THEN** the helper rewrites those files and reports `apply: script`
