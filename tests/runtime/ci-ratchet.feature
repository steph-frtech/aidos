Feature: CI ratchet rejects red regressions before merge
  # mirror record: reflects=S05-ci-ratchet, test_kind=journey,
  #                cert_language=gherkin, liveness=live
  # The cliquet, made mechanical (KRD iteration 3): a step that reddens a
  # previously-green mirror is rejected BEFORE merge, never discovered after.

  Background:
    Given a set of mirrors that are all green on the merge base
    And each green status is recorded in mirror_runs as the baseline

  Scenario: a step that reddens a prior mirror is rejected before merge
    Given a candidate change that breaks a previously-green mirror
    When the ci-ratchet hook runs mirror-runner over every materialized mirror
    Then mirror_runs records a new red run for that mirror flagged regressed=true
    And the hook returns BlockReason RED_REGRESSION with a non-zero exit
    And the merge is rejected

  Scenario: a candidate that keeps every prior mirror green is allowed
    Given a candidate change that leaves all baseline-green mirrors green
    When the ci-ratchet hook runs mirror-runner over every materialized mirror
    Then mirror_runs records all runs as green with regressed=false
    And the hook returns no BlockReason and a zero exit
    And the merge is allowed

  Scenario: an already-red mirror is not a regression
    Given a mirror that was already red on the merge base
    When the ci-ratchet hook runs mirror-runner over every materialized mirror
    And that mirror is still red on the candidate
    Then the merge is allowed
    And no regression is reported for that mirror
