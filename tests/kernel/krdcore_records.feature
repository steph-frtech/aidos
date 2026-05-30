Feature: KRDCore records validate as an empty content-addressed example
  As the Kernel, I store the seven KRDCore record kinds as content-addressed,
  append-only JSONB so every later step has a typed truth-record to read.

  # mirror record: reflects=kernel.records, test_kind=acceptance, cert_language=gherkin, liveness=live, authority=above

  Scenario: aidos check accepts the canonical empty record set
    Given an empty example record of each KRDCore kind
    When I run aidos check over the example
    Then it reports the example VALID
    And each record id equals its content hash equals its version
    And no agent write is required to validate
