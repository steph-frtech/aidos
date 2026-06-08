# S96 — PHASE-KEYED DEPLOY acceptance mirror (Gherkin/Godog, N0).
# reflects=runtime.deploy · test_kind=gherkin · cert_language=godog · authority=above · liveness=live.
#
# « Déployer cette phase » est permis UNIQUEMENT depuis une phase stable (« done is computed »:
# red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre). Le déploiement RÉ-ÉMET l'app
# depuis la phase (S78, déterministe) puis exécute la migration Atlas expand-contract forward-only
# (S95). La phase non-stable est refusée PHASE_NOT_STABLE.

Feature: Phase-keyed deploy
  As the AIDOS Runtime
  I deploy an emitted app only from a stable phase, re-projected from the phase
  So that no red mirror and no stale sandbox artifact is ever deployed

  Scenario: a stable phase deploys, re-projected from the phase
    Given a project "shop" with a complete emitted surface
    And a stable phase with mutation 0.90 over threshold 0.80 and no monster
    When the phase is deployed
    Then the deploy is permitted
    And the deployed app hash equals the phase emitted app hash
    And the deploy URL is a per-phase deploy subdomain

  Scenario: a stable phase migrates its data forward-only
    Given a project "shop" with a complete emitted surface
    And a stable phase with mutation 0.90 over threshold 0.80 and no monster
    And a rename of column "ref" to "reference" on entity "order" of type "text" with a declared backfill
    When the phase is deployed
    Then the deploy is permitted
    And the migration stages are "expand,backfill,contract"
    And the migration preserves all data

  Scenario: a non-stable phase (red mirror) is refused
    Given a project "shop" with a complete emitted surface
    And a phase with a red mirror "createOrder.fixture"
    When the phase is deployed
    Then the deploy is refused with code "PHASE_NOT_STABLE"
    And the refusal names the red mirror "createOrder.fixture"

  Scenario: a phase below the mutation threshold is refused
    Given a project "shop" with a complete emitted surface
    And a stable phase with mutation 0.50 over threshold 0.80 and no monster
    When the phase is deployed
    Then the deploy is refused with code "PHASE_NOT_STABLE"

  Scenario: deploying the same phase twice is reproducible
    Given a project "shop" with a complete emitted surface
    And a stable phase with mutation 0.90 over threshold 0.80 and no monster
    When the phase is deployed twice
    Then both deploys share the same id
