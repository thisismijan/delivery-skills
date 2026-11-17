# Mechanical-edit units

The units `apply-mechanical-edit.ts` proves without a model. `/execute`
follows the helper's verdict; this list explains it.

Proven TypeScript, JavaScript, Python, Java, Go, C#, and Kotlin rename, import-only, and format-only
units apply here without a model. Rust, PHP, and Swift format-only also apply without a model when the repository provides `bin/rustfmt`, `bin/php-format`, or `bin/swift-format`. That includes a unique Python parameter or
local, a unique Java field, a Java type whose listed file name matches, a
unique TypeScript, Python, Java, Go, C#, or Kotlin missing import, and format-only through a repo Prettier,
Ruff, or google-java-format binary, the Go standard formatter, repo-local `bin/csharpier`, or repo-local `bin/ktfmt`, when names and literals stay identical.
