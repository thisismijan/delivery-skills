# note-publication

## Purpose

Refuses note bodies outside the review directory or that look secret-bearing, and routes every publisher through that check.

## Requirements

### Requirement: Notes publish only from the review directory
Publication SHALL be refused unless the body resolves to a path under `.review/`, and every note publisher SHALL use this check before any network call.

#### Scenario: Body outside the review directory
- **WHEN** the body path is outside `.review/`, uses traversal, is absolute elsewhere, or resolves through a symlink to outside
- **THEN** publication is refused

#### Scenario: Body inside the review directory
- **WHEN** the body is under `.review/` with a safe name and clean content
- **THEN** publication is allowed

### Requirement: Secret-bearing bodies are refused
Publication SHALL be refused when the file name or the content looks secret-bearing.

#### Scenario: Secret-bearing name
- **WHEN** the file name is `.env`, a `.pem` file, `id_rsa*`, or `credentials*`
- **THEN** publication is refused

#### Scenario: Secret-like content
- **WHEN** the content contains a token-like value or a private key header
- **THEN** publication is refused

#### Scenario: Publisher checks before posting
- **WHEN** a note publisher is invoked with a refused body
- **THEN** no network call is made
