Feature: The wall denies agent writes above the waterline
  # Acceptance mirror (Gherkin/Godog, N0) for AIDOS step S04 — Le mur.
  # reflects=runtime.wall, test_kind=acceptance, cert_language=gherkin,
  # liveness=live, authority=below. Conceptually stored in the mirrors schema,
  # materialized here for the runner (mirrors schema lands at S06 — bootstrap
  # exception, CLAUDE.md §6). It is a MEANS-test toward the human red (the wall),
  # never a new truth.
  #
  # The wall is the single permission boundary: the agent writes projections
  # (below the waterline), never kernel/mirrors/fitness (above). A denied write
  # comes back as an actionable BlockReason (code AGENT_WRITE_ABOVE_WATERLINE).

  Scenario: agent attempts to write a kernel truth
    Given the actor is the "agent" role
    And a PreToolUse event targeting a write to the "kernel" schema
    When the PreToolUse hook evaluates the event
    Then the verdict is "deny"
    And the BlockReason code is "AGENT_WRITE_ABOVE_WATERLINE"
    And the BlockReason carries a non-empty how_to_fix path

  Scenario Outline: every above-waterline zone is denied
    Given the actor is the "agent" role
    And a PreToolUse event targeting a write to the "<zone>" schema
    When the PreToolUse hook evaluates the event
    Then the verdict is "deny"
    And the BlockReason code is "AGENT_WRITE_ABOVE_WATERLINE"

    Examples:
      | zone    |
      | kernel  |
      | mirrors |
      | fitness |

  Scenario: agent writes a projection below the waterline
    Given the actor is the "agent" role
    And a PreToolUse event targeting a write to "back/gen/"
    When the PreToolUse hook evaluates the event
    Then the verdict is "allow"
