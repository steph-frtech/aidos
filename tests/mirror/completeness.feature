Feature: The Mirror is a living typed proof and the completeness law holds
  # mirror record: reflects=S06-mirror-completeness, test_kind=acceptance,
  #                cert_language=gherkin, liveness=alive
  # The bicephalous body made checkable (KRD §29 la loi de complétude, §34 the
  # Mirror record, LIVRE XXII the monster): a truth without a living mirror, or a
  # mirror reflecting nothing, is a MONSTER — and a monster is red.

  Background:
    Given a kernel layer recorded in the kernel schema at a version
    And the mirrors schema stores typed Mirror records with fields reflects, test_kind, cert_language, authority, liveness

  Scenario: no_truth_without_mirror — a kernel layer with no living mirror is a monster
    Given a kernel layer that has no mirror of any required test_kind
    When completeness is computed over mirrors joined to kernel
    Then the layer is reported in the monster set as no_truth_without_mirror
    And the completeness verdict is red

  Scenario: no_orphan_mirror — a mirror reflecting nothing is a monster
    Given a mirror whose reflects target no longer exists at that version
    When completeness is computed over mirrors joined to kernel
    Then the mirror is reported in the monster set as no_orphan_mirror
    And its liveness is dead
    And the completeness verdict is red

  Scenario: a typed mirror that reflects a real layer and is executable is alive
    Given a kernel layer at a version
    And a mirror reflecting it with an executable cert_language and liveness alive
    When completeness is computed over mirrors joined to kernel
    Then the monster set is empty for that layer
    And the completeness verdict is green

  Scenario: a non-executable cert_language does not count toward completeness
    Given a kernel layer whose only mirror has a non-executable cert_language
    When completeness is computed over mirrors joined to kernel
    Then the layer is still reported as no_truth_without_mirror
    And the completeness verdict is red
