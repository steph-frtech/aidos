# S98 — Environments + rollback-to-phase (re-projection, not artifact checkout).
# app-builder EPIC 10, DP28 / ADR 0043.
#
# reflects=archive.envrollback · test_kind=gherkin · cert_language=godog · authority=above ·
# liveness=live. The plane writes NOTHING (the wall): Promote/Rollback return a Promotion /
# RollbackDecision or a typed BlockReason. A rollback is a RECORDED DECISION (provenance §9), not
# a write-to-kernel; the screen proposes it as a ChangeSet.

Feature: Environments and rollback by re-projection
  As an AIDOS operator
  I want to promote a stable phase to prod and roll back to an earlier stable phase
  So that an incident is recovered by RE-EMITTING the earlier phase — never by restoring a stale
  sandbox artifact — with the decision provenanced and nothing deleted.

  Background:
    Given a project "shop"
    And an earlier stable phase "N-1" at version "v1"
    And a later stable phase "N" at version "v2"
    And the DAG lineage of "N" includes "N-1"

  Scenario: Promote a stable phase to prod
    When phase "N" is promoted to "prod"
    Then the promotion is permitted
    And prod serves the re-emitted app of phase "N"
    And the promotion stack is a per-env "prod" stack

  Scenario: Promoting a non-stable phase to prod is refused
    Given a non-stable phase "RED" at version "v9"
    When phase "RED" is promoted to "prod"
    Then the promotion is refused with code "ENV_PROMOTE_NOT_STABLE"

  Scenario: Incident in prod, rollback to N-1 re-emits the earlier phase
    Given phase "N" is promoted to "prod"
    And an incident "checkout 500s" happens in prod
    When prod is rolled back to phase "N-1" by "alice" because "incident checkout 500s"
    Then the rollback is permitted
    And prod serves the re-emitted app of phase "N-1"
    And prod does NOT serve the stale artifact of phase "N"
    And the rollback decision is provenanced to "alice" because "incident checkout 500s"
    And nothing is deleted and the decision is append-only

  Scenario: Rollback to the currently-served phase is refused
    Given phase "N" is promoted to "prod"
    When prod is rolled back to phase "N" by "alice" because "mistake"
    Then the rollback is refused with code "ROLLBACK_NOT_EARLIER"

  Scenario: Rollback to a phase that does not precede the served phase is refused
    Given phase "N" is promoted to "prod"
    And the DAG lineage of "N" is empty
    When prod is rolled back to phase "N-1" by "alice" because "wrong target"
    Then the rollback is refused with code "ROLLBACK_NOT_EARLIER"
