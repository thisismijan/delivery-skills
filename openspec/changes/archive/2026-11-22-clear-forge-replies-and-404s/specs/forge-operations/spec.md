## ADDED Requirements

### Requirement: A provider 404 says what was asked and why it may fail

A GitLab, GitHub, or Jira adapter that receives HTTP 404 SHALL fail with a
message naming the method and resource path, without query values or
credentials. The message SHALL say that the token, or the Jira account, may
lack access, and SHALL name where a GitLab or GitHub token came from by its
variable or file, never its value.

#### Scenario: Token without project access

- **WHEN** GitLab answers 404 for a create because the token cannot see the project
- **THEN** the adapter fails with "GitLab answered HTTP 404 for POST /projects/<project>/merge_requests", names the token source, and says the token may not see that project
