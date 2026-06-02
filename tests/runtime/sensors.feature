Feature: PostToolUse sensors block a failing diff and pass a clean one
  # Acceptance mirror (Gherkin/Godog, N0) for AIDOS step S07 — Les sensors.
  # reflects=runtime.sensors, test_kind=acceptance, cert_language=gherkin,
  # liveness=live, authority=below. Conceptually stored in the mirrors schema,
  # materialized here for the runner. It is a MEANS-test toward the human red
  # (the agent self-certifies on the computational), never a new truth.
  #
  # The sensors are the twin of the wall: PreToolUse blocks an illegal WRITE,
  # PostToolUse blocks a BROKEN DIFF. Any failing computational sensor (gofmt,
  # vet, lint, archtest, affected) returns verdict "block" with an actionable
  # BlockReason (code SENSOR_FAILED); a clean diff returns "allow". Every run is
  # recorded append-only in runtime.sensor_runs.

  Scenario: a diff with a failing affected test is blocked
    Given a PostToolUse event for an "Edit" below the waterline
    And the changed code makes the "affected" sensor fail
    When the PostToolUse hook runs the computational sensors
    Then the verdict is "block"
    And the BlockReason code is "SENSOR_FAILED"
    And the BlockReason names the failing check "affected"
    And the BlockReason carries a non-empty how_to_fix path
    And a sensor_runs row is recorded with verdict "block"

  Scenario Outline: every computational check can block on its own fault
    Given a PostToolUse event for an "Edit" below the waterline
    And the changed code makes the "<check>" sensor fail
    When the PostToolUse hook runs the computational sensors
    Then the verdict is "block"
    And the BlockReason code is "SENSOR_FAILED"
    And the failing check in the sensor_runs row is "<check>"

    Examples:
      | check    |
      | gofmt    |
      | vet      |
      | lint     |
      | archtest |
      | affected |

  Scenario: a clean diff passes
    Given a PostToolUse event for an "Edit" below the waterline
    And the changed code passes gofmt, vet, lint, archtest and all affected tests
    When the PostToolUse hook runs the computational sensors
    Then the verdict is "allow"
    And a sensor_runs row is recorded with verdict "allow"

  Scenario: an errored or unknown sensor is a failure, never a silent pass
    Given a PostToolUse event for an "Edit" below the waterline
    And the "lint" sensor errors (its result is unknown)
    When the PostToolUse hook runs the computational sensors
    Then the verdict is "block"
    And the BlockReason code is "SENSOR_FAILED"
    And the failing check in the sensor_runs row is "lint"
