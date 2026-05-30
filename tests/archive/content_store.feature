Feature: Content-addressed append-only store
  As the Archive, I store objects by content hash so nothing is ever destroyed.

  # mirror record: reflects=S01-content-store, test_kind=journey, cert_language=gherkin, liveness=live

  Background:
    Given a Postgres instance with the archive baseline migration applied

  Scenario: Write then read an object by its hash
    When I put the bytes "hello" into the store
    Then I get back a content hash
    And reading that hash returns exactly the bytes "hello"

  Scenario: Putting identical bytes is idempotent
    When I put the bytes "hello" twice
    Then both puts return the same hash
    And the content table holds exactly one row for that hash

  Scenario: Editing an object creates a new hash, old hash still readable
    Given I put the bytes "v1" under head "doc"
    When I put the bytes "v2" under head "doc"
    Then the head "doc" now points at the hash of "v2"
    And the hash of "v1" still reads back "v1"
    And the history of "doc" lists both moves oldest-first
