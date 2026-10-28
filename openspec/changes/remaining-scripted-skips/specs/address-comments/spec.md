## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

When gather-and-scope finds a new-side anchor whose path is missing at the pinned head, or whose line is past the end of that file, `/address-comments` SHALL record a scripted `outdated` verdict and SHALL NOT send that comment to the comment-assessor. An empty or whitespace-only body SHALL be outdated the same way. A body that is only acknowledgements such as LGTM, thanks, approved, or done SHALL be outdated the same way. A body that is only a mention SHALL be outdated the same way. A body that is only a URL SHALL be outdated the same way. A body that is only emoji SHALL be outdated the same way. A comment whose body is only a suggestion fence, and whose suggested text is already present in that file, SHALL be outdated the same way. Resolved discussions and resolved notes SHALL be dropped before classification. Unanchored comments, old-side anchors, and paths the command did not look up SHALL stay in scope. When no in-scope comments remain, the command SHALL NOT dispatch the assessor.

#### Scenario: A gone new-side line is outdated
- **WHEN** a remaining comment has a new-side anchor on a missing file or a line past the end of the file at the pinned head
- **THEN** classification includes a scripted outdated verdict for that comment
- **AND** the comment-assessor does not receive it

#### Scenario: Empty in-scope list skips the assessor
- **WHEN** gather-and-scope leaves zero in-scope comments
- **THEN** no comment-assessor is dispatched
- **AND** classification is the scripted outdated verdicts or an empty array

#### Scenario: A resolved discussion is dropped before classification
- **WHEN** a discussion or note is already resolved
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: An empty body is outdated without a classifier
- **WHEN** a remaining comment body is empty after trim
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An acknowledgement is outdated without a classifier
- **WHEN** a remaining comment body is only acknowledgements such as LGTM, thanks, approved, or done
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A mention-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a mention
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A URL-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a URL
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An emoji-only body is outdated without a classifier
- **WHEN** a remaining comment body is only emoji
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An applied suggestion is outdated without a classifier
- **WHEN** a remaining comment body is only a suggestion fence
- **AND** that suggested text is already present in the anchored file at the pinned head
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor
