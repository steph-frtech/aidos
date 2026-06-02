Feature: The Stop hook enforces the completeness law and blocks on a monster
  # mirror record: reflects=S12-completeness-stop-gate, test_kind=acceptance,
  #                cert_language=gherkin, liveness=alive, authority=above
  # S12 turns S06's read-only completeness verdict into a NON-BYPASSABLE gate at
  # Stop (KRD §29, §74/§77, LIVRE XXII §126-§127): a spec without a living mirror,
  # or a mirror reflecting nothing, is a MONSTER — and a monster BLOCKS Stop.

  Background:
    Given the mirrors schema holds typed Mirror records reflecting kernel layers at a version
    And a Stop event closes the current cut

  Scenario: no_truth_without_mirror — a spec without a living mirror blocks Stop
    Given a kernel layer that has no living mirror of any required test_kind
    When the Stop hook runs the completeness check over mirrors joined to kernel
    Then the verdict is "block"
    And the BlockReason code is "MONSTER"
    And the monster set reports the layer as no_truth_without_mirror with a how_to_fix
    And a completeness_runs row is recorded with verdict "block"

  Scenario: no_orphan_mirror — a mirror reflecting nothing blocks Stop
    Given a mirror whose reflects target no longer exists at that version
    When the Stop hook runs the completeness check over mirrors joined to kernel
    Then the verdict is "block"
    And the BlockReason code is "MONSTER"
    And the monster set reports the mirror as no_orphan_mirror
    And a completeness_runs row is recorded with verdict "block"

  Scenario: no monster — a complete cut passes Stop
    Given every kernel layer has at least one living, executable, correctly-reflecting mirror
    When the Stop hook runs the completeness check over mirrors joined to kernel
    Then the verdict is "pass"
    And the monster set is empty
    And a completeness_runs row is recorded with verdict "pass"
