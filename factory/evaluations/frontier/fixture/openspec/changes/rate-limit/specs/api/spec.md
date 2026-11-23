## ADDED Requirements

### Requirement: Requests are limited per client

The API SHALL allow at most 100 requests per minute per client and SHALL answer HTTP 429 to a client over the limit until the minute ends.

#### Scenario: Signed-in client over the limit

- **GIVEN** a signed-in client has made 100 requests this minute
- **WHEN** it makes another request
- **THEN** the API answers 429

#### Scenario: Anonymous client over the limit

- **GIVEN** an anonymous client has made 100 requests to `/public/quote` this minute from one address
- **WHEN** it makes another request
- **THEN** the API answers 429
