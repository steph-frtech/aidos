Feature: Every block explains itself and how to fix it
  # Mirror: reflects=runtime.blockreason, test_kind=acceptance, cert_language=gherkin,
  # liveness=live, authority=below. Conceptually stored in the `mirrors` schema,
  # materialized here for the runner (mirrors schema lands at S06; until then this
  # file IS the red->green proof — bootstrap exception, CLAUDE.md §6).
  #
  # KRD §44.5: "Un blocage KRD doit toujours fournir un chemin de résolution."
  # A wall without a BlockReason becomes a prison — `aidos explain` names the door.

  Scenario Outline: aidos explain renders an actionable BlockReason
    Given a block with code "<code>"
    When I run "aidos explain" on that block
    Then the output shows the code "<code>"
    And the output shows a non-empty severity
    And the output shows a human explanation
    And the output lists at least one how_to_fix step

    Examples:
      | code              |
      | MISSING_MIRROR    |
      | MISSING_AUTHORITY |
      | OUT_OF_SCOPE      |

  Scenario: MISSING_MIRROR points at the idea -> mirror -> /goal door
    Given a block with code "MISSING_MIRROR"
    When I run "aidos explain" on that block
    Then a how_to_fix step is "write_mirror"
    And a how_to_fix step is "rerun aidos check"

  Scenario: MISSING_AUTHORITY points at assigning authority
    Given a block with code "MISSING_AUTHORITY"
    When I run "aidos explain" on that block
    Then a how_to_fix step is "assign_authority"

  Scenario: OUT_OF_SCOPE points at the scope owner
    Given a block with code "OUT_OF_SCOPE"
    When I run "aidos explain" on that block
    Then a how_to_fix step names the in-scope target or its owner

  Scenario: an unknown code exits with a usage error, never a prison
    Given a block with code "NOPE_NOT_A_CODE"
    When I run "aidos explain" on that block
    Then the command exits with code 2
