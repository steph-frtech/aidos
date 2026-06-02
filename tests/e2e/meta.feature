Feature: Méta-méta — the harness self-test panel (/meta, S39)
  The /meta panel renders the meta-meta self-test (KRD §70): the three inviolable
  NIVEAU 3 guarantees as a green/red checklist, the per-sensor fault-injection, the
  read-only fitness baseline, and the append-only run history. The verdict is computed
  by the pure twin of the Go Run; the panel re-runs it on a selected harness scenario.

  Scenario: a healthy harness shows the three guarantees green
    Given I am on the meta panel
    When the healthy harness scenario is selected
    Then the verdict is green
    And the sensors fired count is 5/5
    And the wall is refused on kernel, mirrors and fitness
    And the fitness baseline hash equals the current hash

  Scenario: the per-sensor fault-injection rows are listed
    Given I am on the meta panel
    Then each sensor probe row is listed with its fired status

  Scenario: the fitness baseline is read-only (the inviolable)
    Given I am on the meta panel
    Then the fitness baseline panel has no editable control
    And it carries the read-only badge

  Scenario: a mutated fitness reddens and surfaces FITNESS_MUTATED
    Given I am on the meta panel
    When the mutated-fitness scenario is selected
    Then the verdict is red
    And the BlockReason code is FITNESS_MUTATED
    And the prior runs stay listed in the append-only history
