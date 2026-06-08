# S95 — Migration de donnée de l'app émise sur changement breaking (app-builder EPIC 10).
# reflects=runtime.datamigrate · test_kind=gherkin · cert_language=godog · authority=above ·
# liveness=live. The planner writes nothing (the wall): Build returns a Plan or a BlockReason.
Feature: Migrate the data of a deployed emitted app on a breaking schema change
  On a deployed app carrying REAL rows, a breaking schema change (rename, entity split,
  cardinality widening) migrates the data via expand-contract + backfill, DataTruthScope-gated.
  A breaking change with no declared backfill is REFUSED (BREAKING_MIGRATION_NO_BACKFILL).

  Scenario: rename-with-backfill preserves every row's value
    Given a deployed app "shop" with real rows
    And a rename of column "ref" to "reference" on entity "order" of type "text"
    And a declared backfill DataTruthScope
    When I build the data-migration plan
    Then the plan stages expand then backfill then contract
    And the backfill step recopies the old column into the new
    And the plan preserves all data

  Scenario: an entity split ventilates rows into the new table without loss
    Given a deployed app "shop" with real rows
    And a split moving column "address" from entity "order" into entity "shipment" of type "text"
    And a declared backfill DataTruthScope
    When I build the data-migration plan
    Then the plan stages expand then backfill then contract
    And the backfill step ventilates the source rows into the new table
    And the plan preserves all data

  Scenario: a 1-N to N-N cardinality change migrates without loss
    Given a deployed app "shop" with real rows
    And a cardinality widening of relation "tag" from "1-N" to "N-N" between "order" and "label"
    And a declared backfill DataTruthScope
    When I build the data-migration plan
    Then the plan stages expand then backfill then contract
    And the backfill step fills the join table from the existing foreign keys
    And the plan preserves all data

  Scenario: a breaking migration with no backfill is refused
    Given a deployed app "shop" with real rows
    And a rename of column "ref" to "reference" on entity "order" of type "text"
    And no declared backfill DataTruthScope
    When I build the data-migration plan
    Then the plan is refused with code "BREAKING_MIGRATION_NO_BACKFILL"
    And how_to_fix names the declared backfill

  Scenario: the migration emission is reproducible
    Given a deployed app "shop" with real rows
    And a rename of column "ref" to "reference" on entity "order" of type "text"
    And a declared backfill DataTruthScope
    When I build the data-migration plan twice
    Then both plans share the same id
