Feature: Step execution contract is versioned and machine-readable
  As the AIDOS harness and a human operator
  I want the per-step loop and granularity rule as one versioned, parseable checklist
  So that every later step can be checked against the same law

  # mirror record: reflects=S00-exec-contract, test_kind=journey, cert_language=gherkin, liveness=live

  Scenario: The contract file exists
    Given the file "docs/implementation_contract.md"
    Then the file exists on disk

  Scenario: The contract is versioned and parses
    Given the file "docs/implementation_contract.md"
    When the embedded contract block is parsed
    Then it has a semver "version" field
    And it has kind "step-contract"
    And it lists nine per-step loop phases with the §6 ids
    And every phase has a unique "id" field
    And every phase has a "gate" field with value "computational" or "human"
    And it lists the five granularity properties: minimal, autonomous, visualizable, non-destructive, chainable

  Scenario: Every checklist item id is unique
    Given the file "docs/implementation_contract.md"
    When the embedded contract block is parsed
    Then every checklist item id is unique across phases and granularity properties
