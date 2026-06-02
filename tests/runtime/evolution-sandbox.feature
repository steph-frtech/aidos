# mirrors schema · reflects: runtime.evolve EvolutionSandbox (Confine/Promote/Evolve) · test_kind: gherkin
# cert_language: godog · authority: above · liveness: live
#
# The S42 EvolutionSandbox as a Runtime journey (KRD §66.1, §62 algorithm ②, §64, §66, §87): every
# /evolve medium-loop run executes in a QUARANTINE that can_write only {/branches/evolution, /reports,
# /ideas/proposed} and cannot_write {/kernel, /mirrors/above, /authority, /fitness}. "L'évolution
# explore, elle ne gouverne pas." A variant is promoted into a QD niche only with mirror_green ∧
# out_of_sample_green ∧ authority_approval — a binary gate (the deterministic MIROIR), never a score
# the loop grades itself; out-of-sample, never in-sample.
#
# Materialized source: conceptually stored in the `mirrors` schema, persisted to Postgres at S06
# (bootstrap exception, CLAUDE.md §6). This file is the LIEN PORTEUR of the journey.

Feature: /evolve writes only branches/reports/ideas; QD promotion needs a green mirror

  Scenario: A candidate branch is allowed
    Given an active /evolve run on cell "createOrder"
    When the run writes a variant to "/branches/evolution/var-7"
    Then the write is allowed
    When the run writes a score to "/reports/var-7.json"
    Then the write is allowed
    When the run writes a suggestion to "/ideas/proposed/retry-cap"
    Then the write is allowed

  Scenario: Writing /kernel from the sandbox is forbidden
    Given an active /evolve run on cell "createOrder"
    When the run writes to "/kernel/createOrder.operation"
    Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"
    And how_to_fix contains "open_a_/goal_to_promote_a_candidate"
    When the run writes to "/fitness/createOrder.budget"
    Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"
    When the run writes to "/authority/createOrder"
    Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"
    When the run writes to "/mirrors/above/createOrder.feature"
    Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"

  Scenario: A variant with a green mirror can be promoted
    Given a variant "var-7" in niche "createOrder/discount" with mirror "green", out_of_sample "green" and authority_approval "true"
    When the run proposes its promotion
    Then a promotion proposal is produced for niche "createOrder/discount"
    And the sandbox did not write the kernel, a mirror, authority or fitness

  Scenario: A variant with a RED mirror is NOT promoted, whatever its score
    Given a variant "var-9" in niche "createOrder/discount" with mirror "red", out_of_sample "green" and authority_approval "true"
    When the run proposes its promotion
    Then the promotion is refused

  Scenario: A variant passing the mirror but failing out-of-sample is NOT promoted
    Given a variant "var-3" in niche "createOrder/discount" with mirror "green", out_of_sample "red" and authority_approval "true"
    When the run proposes its promotion
    Then the promotion is refused
